import type { EndpointDef, RetryConfig } from "./types";
import { ApiError, ValidationError } from "./errors";
import { HttpClient } from "./http-client";

const DEFAULT_RETRY: RetryConfig = {
  retries: 2,
  retryDelay: 1000,
  retryOn: [408, 500, 502, 503, 504],
};

interface FetchInput {
  body?: unknown;
  query?: unknown;
  params?: Record<string, string>;
}

/**
 * Composes the concerns around a raw HTTP call:
 *   validate input → dedupe (GET only) → retry → HttpClient → validate response → transform
 */
export class RequestPipeline {
  private inflight = new Map<string, Promise<unknown>>();
  private defaultRetry: RetryConfig;

  constructor(private http: HttpClient, defaults?: { retry?: Partial<RetryConfig> }) {
    this.defaultRetry = { ...DEFAULT_RETRY, ...defaults?.retry };
  }

  async execute<T = unknown>(
    endpoint: EndpointDef,
    input: unknown,
    opts?: { signal?: AbortSignal },
  ): Promise<T> {
    const validated = validateInput(endpoint, input as FetchInput | undefined);
    const retry = { ...this.defaultRetry, ...endpoint.retry };

    const run = () => withRetry(retry, () => this.http.request({
      method: endpoint.method,
      path: endpoint.path,
      query: validated?.query,
      params: validated?.params,
      body: validated?.body,
      headers: endpoint.headers,
      signal: opts?.signal,
    }));

    const raw = endpoint.method === "GET"
      ? await this.dedupe(stableRequestKey(endpoint, validated), run)
      : await run();

    return finalizeResponse(endpoint, raw) as T;
  }

  private async dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;
    const promise = run().finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }
}

// ── validation ───────────────────────────────────────────────────────────────

function validateInput(endpoint: EndpointDef, input: FetchInput | undefined): FetchInput | undefined {
  if (endpoint.path.includes(":") && !input?.params) {
    const missing = endpoint.path.match(/:(\w+)/g)!;
    throw new Error(`Missing path params: ${missing.join(", ")} in "${endpoint.path}". Pass them as { params: { ... } }`);
  }
  if (!input) return input;

  return {
    ...input,
    ...(endpoint.params && input.params  && { params: parseWith(endpoint.params, input.params, "params") as Record<string, string> }),
    ...(endpoint.query  && input.query  !== undefined && { query: parseWith(endpoint.query,  input.query,  "query") }),
    ...(endpoint.body   && input.body   !== undefined && { body:  parseWith(endpoint.body,   input.body,   "body") }),
  };
}

function parseWith(schema: { parse(data: unknown): unknown }, data: unknown, field: "body" | "query" | "params"): unknown {
  try {
    return schema.parse(data);
  } catch (cause) {
    throw new ValidationError(field, cause);
  }
}

function finalizeResponse(endpoint: EndpointDef, raw: unknown): unknown {
  let data = raw;
  if (endpoint.response) data = parseWith(endpoint.response, data, "response" as "body");
  if (endpoint.transform) data = endpoint.transform(data);
  return data;
}

// ── retry ────────────────────────────────────────────────────────────────────

async function withRetry<T>(config: RetryConfig, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= config.retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const retriable = error instanceof ApiError && config.retryOn.includes(error.status);
      if (!retriable || attempt >= config.retries) throw error;
      await delay(config.retryDelay * 2 ** attempt);
    }
  }
  throw new Error("Unreachable");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stableRequestKey(endpoint: EndpointDef, input: FetchInput | undefined): string {
  return `${endpoint.method} ${endpoint.path} ${JSON.stringify(input ?? null)}`;
}
