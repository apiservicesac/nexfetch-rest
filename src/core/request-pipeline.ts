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
    input: FetchInput | undefined,
    opts?: { signal?: AbortSignal },
  ): Promise<T> {
    const validated = validateInput(endpoint, input);
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

    let raw: unknown;
    if (endpoint.method === "GET") {
      const key = stableRequestKey(endpoint, validated);
      const existing = this.inflight.get(key);
      if (existing) {
        raw = await existing;
      } else {
        const promise = run();
        this.inflight.set(key, promise);
        try {
          raw = await promise;
        } finally {
          this.inflight.delete(key);
        }
      }
    } else {
      raw = await run();
    }

    return finalizeResponse(endpoint, raw) as T;
  }
}

// ── validation ───────────────────────────────────────────────────────────────

function validateInput(endpoint: EndpointDef, input: FetchInput | undefined): FetchInput | undefined {
  const hasPathParams = endpoint.path.includes(":");
  if (hasPathParams && !input?.params) {
    const missing = endpoint.path.match(/:(\w+)/g)!;
    throw new Error(`Missing path params: ${missing.join(", ")} in "${endpoint.path}". Pass them as { params: { ... } }`);
  }
  if (!input) return input;

  let next = input;
  if (endpoint.params && input.params) {
    next = { ...next, params: parseWith(endpoint.params, input.params, "params") as Record<string, string> };
  }
  if (endpoint.query && input.query !== undefined) {
    next = { ...next, query: parseWith(endpoint.query, input.query, "query") };
  }
  if (endpoint.body && input.body !== undefined) {
    next = { ...next, body: parseWith(endpoint.body, input.body, "body") };
  }
  return next;
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

// ── dedupe key ───────────────────────────────────────────────────────────────

function stableRequestKey(endpoint: EndpointDef, input: FetchInput | undefined): string {
  return `${endpoint.method} ${endpoint.path} ${JSON.stringify(input ?? null)}`;
}
