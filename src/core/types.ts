import type { Schema } from "./schema";
import type { ApiError } from "./errors";

// ── HTTP ─────────────────────────────────────────────────────────────────────

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

// ── Endpoint definition ──────────────────────────────────────────────────────

export interface EndpointDef<_I = unknown, _O = unknown> {
  path: string;
  method: HttpMethod;
  body?: Schema;
  query?: Schema;
  params?: Schema;
  response?: Schema;
  headers?: Record<string, string>;
  staleTime?: number;
  tags?: string[];
  invalidates?: string[];
  retry?: Partial<RetryConfig>;
  transform?: (raw: unknown) => unknown;
}

export type EndpointMap = Record<string, EndpointDef>;
export type NamespacedEndpoints = Record<string, EndpointMap>;

// ── Input / output inference ─────────────────────────────────────────────────

type Infer<S> = S extends Schema<infer T> ? T : never;

type InputParts<E extends EndpointDef> =
  (E["body"]   extends Schema ? { body:   Infer<E["body"]>   } : {}) &
  (E["query"]  extends Schema ? { query:  Infer<E["query"]>  } : {}) &
  (E["params"] extends Schema ? { params: Infer<E["params"]> } : {});

export type InputOf<E extends EndpointDef> =
  InputParts<E> extends Record<string, never> ? void : InputParts<E>;

export type OutputOf<E extends EndpointDef> =
  E["response"] extends Schema ? Infer<E["response"]> : unknown;

// ── Config ───────────────────────────────────────────────────────────────────

export interface CacheConfig {
  staleTime: number;
  gcTime: number;
  refetchOnFocus: boolean;
}

export interface RetryConfig {
  retries: number;
  retryDelay: number;
  retryOn: number[];
}

export interface ClientOptions<T extends NamespacedEndpoints = NamespacedEndpoints> {
  baseURL: string;
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
  endpoints: T;
  cache?: Partial<CacheConfig>;
  retry?: Partial<RetryConfig>;
  onError?: (error: ApiError) => void;
}

// ── State shapes ─────────────────────────────────────────────────────────────

export type QueryStatus = "idle" | "pending" | "success" | "error";

export interface QueryState<T> {
  data: T | undefined;
  error: Error | undefined;
  status: QueryStatus;
  isFetching: boolean;
}

export interface MutationState<T> {
  data: T | undefined;
  error: Error | undefined;
  status: QueryStatus;
}

export interface InfiniteQueryState<T> {
  pages: T[][];
  flat: T[];
  status: QueryStatus;
  error: Error | undefined;
  isFetchingMore: boolean;
  hasMore: boolean;
}

// ── Options ──────────────────────────────────────────────────────────────────

export interface QueryOptions<TData = unknown, TSelected = TData> {
  enabled?: boolean;
  refetchInterval?: number;
  select?: (data: TData) => TSelected;
}

export interface MutateOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

export interface MutationOptions<I, O> {
  onSuccess?: (data: O, input: I) => void;
  onError?: (error: Error, input: I) => void;
}

export type PaginationConfig =
  | { type: "offset"; pageSize: number; pageParam?: string }
  | { type: "cursor"; cursorField: string; cursorParam?: string }
  | { type: "total";  totalField: string; pageSize: number; pageParam?: string };

export interface InfiniteQueryOptions<TInput = unknown> {
  input?: TInput;
  pagination: PaginationConfig;
  enabled?: boolean;
}
