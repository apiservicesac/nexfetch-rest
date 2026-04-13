import { ApiError } from "./errors";
import type { HttpMethod } from "./types";

export interface HttpRequest {
  method: HttpMethod;
  path: string;
  query?: unknown;
  params?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface HttpClientOptions {
  baseURL: string;
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
  onError?: (error: ApiError) => void;
}

/**
 * Pure HTTP layer. Builds URL, performs fetch, parses JSON, throws ApiError.
 * No cache, no retry, no deduplication, no validation — those are composed by
 * RequestPipeline.
 */
export class HttpClient {
  constructor(private opts: HttpClientOptions) {}

  async request<T = unknown>(req: HttpRequest): Promise<T> {
    const url = this.buildUrl(req.path, req.query, req.params);
    const init: RequestInit = {
      method: req.method,
      credentials: this.opts.credentials,
      headers: {
        ...this.opts.headers,
        ...req.headers,
        "Content-Type": "application/json",
      },
      signal: req.signal,
    };
    if (req.body !== undefined && req.method !== "GET") {
      init.body = JSON.stringify(req.body);
    }

    const response = await fetch(url, init);

    if (response.status === 204) return undefined as T;

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const error = new ApiError(
        (body as { message?: string } | null)?.message ?? response.statusText,
        response.status,
        body,
      );
      this.opts.onError?.(error);
      throw error;
    }

    return (await response.json()) as T;
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

    const url = new URL(resolved, this.opts.baseURL);
    if (query && typeof query === "object") {
      for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }
}
