import type { EndpointDef, FetcherOptions, FetchInput, RetryConfig } from "./types";
import { ApiError } from "./types";

const DEFAULT_RETRY: RetryConfig = { retries: 2, retryDelay: 1000, retryOn: [408, 500, 502, 503, 504] };

export class Fetcher {
  private retryConfig: RetryConfig;
  private inflight = new Map<string, Promise<unknown>>();

  constructor(private options: FetcherOptions) {
    this.retryConfig = { ...DEFAULT_RETRY, ...options.retry };
  }

  async request<T = unknown>(endpoint: EndpointDef, input?: FetchInput): Promise<T> {
    // ── Runtime validation ──────────────────────────────────────
    const hasPathParams = endpoint.path.includes(":");
    if (hasPathParams && !input?.params) {
      const missing = endpoint.path.match(/:(\w+)/g);
      throw new Error(`Missing path params: ${missing!.join(", ")} in "${endpoint.path}". Pass them as { params: { ... } }`);
    }
    if (input) {
      if (endpoint.params && input.params) {
        input = { ...input, params: endpoint.params.parse(input.params) as Record<string, string> };
      }
      if (endpoint.query && input.query) {
        input = { ...input, query: endpoint.query.parse(input.query) };
      }
      if (endpoint.body && input.body) {
        input = { ...input, body: endpoint.body.parse(input.body) };
      }
    }

    const url = this.buildUrl(endpoint.path, input?.query, input?.params);
    const init: RequestInit = {
      method: endpoint.method,
      credentials: this.options.credentials,
      headers: { ...this.options.headers, ...endpoint.headers, "Content-Type": "application/json" },
    };
    if (input?.body && endpoint.method !== "GET") {
      init.body = JSON.stringify(input.body);
    }

    if (endpoint.method === "GET") {
      const existing = this.inflight.get(url);
      if (existing) return existing as Promise<T>;
      const promise = this.execute<T>(url, init, endpoint);
      this.inflight.set(url, promise);
      promise.finally(() => this.inflight.delete(url));
      return promise;
    }

    return this.execute<T>(url, init, endpoint);
  }

  private async execute<T>(url: string, init: RequestInit, endpoint: EndpointDef): Promise<T> {
    const { retries, retryDelay, retryOn } = this.retryConfig;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, init);
        if (response.ok) {
          if (response.status === 204) return undefined as T;
          const data = await response.json();
          return (endpoint.response ? endpoint.response.parse(data) : data) as T;
        }
        if (retryOn.includes(response.status) && attempt < retries) {
          await this.delay(retryDelay * 2 ** attempt);
          continue;
        }
        const body = await response.json().catch(() => null);
        const error = new ApiError(body?.message ?? response.statusText, response.status, body);
        this.options.onError?.(error);
        throw error;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (attempt >= retries) throw error;
        await this.delay(retryDelay * 2 ** attempt);
      }
    }
    throw new Error("Unreachable");
  }

  private buildUrl(path: string, query?: unknown, params?: Record<string, string>): string {
    let resolved = path;
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        resolved = resolved.replace(`:${key}`, encodeURIComponent(value));
      }
    }
    const missing = resolved.match(/:(\w+)/g);
    if (missing) {
      throw new Error(`Missing path params: ${missing.join(", ")} in "${path}"`);
    }
    const url = new URL(resolved, this.options.baseURL);
    if (query && typeof query === "object") {
      for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
