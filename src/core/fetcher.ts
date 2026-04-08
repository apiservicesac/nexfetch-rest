import type { EndpointDef, RetryConfig } from "./types";
import { ApiError } from "./types";

export interface FetcherOptions {
  baseURL: string;
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
  retry?: Partial<RetryConfig>;
  onError?: (error: ApiError) => void;
}

const DEFAULT_RETRY: RetryConfig = {
  retries: 2,
  retryDelay: 1000,
  retryOn: [408, 500, 502, 503, 504],
};

export class Fetcher {
  private retryConfig: RetryConfig;
  private inflight = new Map<string, Promise<unknown>>();

  constructor(private options: FetcherOptions) {
    this.retryConfig = { ...DEFAULT_RETRY, ...options.retry };
  }

  async request<TResponse = unknown>(
    endpoint: EndpointDef,
    input?: { body?: unknown; query?: unknown; params?: Record<string, string> },
  ): Promise<TResponse> {
    const url = this.buildUrl(endpoint.path, input?.query, input?.params);
    const init: RequestInit = {
      method: endpoint.method,
      credentials: this.options.credentials,
      headers: { "Content-Type": "application/json", ...this.options.headers, ...endpoint.headers },
    };

    if (input?.body && endpoint.method !== "GET") {
      init.body = JSON.stringify(input.body);
    }

    // In-flight dedup for GET requests
    if (endpoint.method === "GET") {
      const existing = this.inflight.get(url);
      if (existing) return existing as Promise<TResponse>;

      const promise = this.fetchWithRetry<TResponse>(url, init, endpoint);
      this.inflight.set(url, promise);
      promise.finally(() => this.inflight.delete(url));
      return promise;
    }

    return this.fetchWithRetry<TResponse>(url, init, endpoint);
  }

  private async fetchWithRetry<TResponse>(url: string, init: RequestInit, endpoint: EndpointDef): Promise<TResponse> {
    const { retries, retryDelay, retryOn } = this.retryConfig;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, init);

        if (response.ok) {
          if (response.status === 204) return undefined as TResponse;
          const data = await response.json();
          return endpoint.response ? (endpoint.response.parse(data) as TResponse) : (data as TResponse);
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
