import type { ReadableAtom } from "nanostores";

// ── Schema (validator-agnostic) ──────────────────────────────────────────────

export interface Schema<T = unknown> {
  parse(data: unknown): T;
}

// ── Endpoint ─────────────────────────────────────────────────────────────────

export interface EndpointDef {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: Schema;
  query?: Schema;
  params?: Schema;
  response?: Schema;
  headers?: Record<string, string>;
  staleTime?: number;
  invalidate?: string[];
}

export type EndpointMap = Record<string, EndpointDef>;
export type NamespacedEndpoints = Record<string, EndpointMap>;

// ── Input / Output inference ─────────────────────────────────────────────────

type Infer<S> = S extends Schema<infer T> ? T : never;

type InputParts<E extends EndpointDef> =
  (E["body"] extends Schema ? { body: Infer<E["body"]> } : {}) &
  (E["query"] extends Schema ? { query: Infer<E["query"]> } : {}) &
  (E["params"] extends Schema ? { params: Infer<E["params"]> } : {});

// void when endpoint has no body/query/params
export type ResolvedInput<E extends EndpointDef> =
  InputParts<E> extends Record<string, never> ? void : InputParts<E>;

export type InferResponse<E extends EndpointDef> =
  E["response"] extends Schema ? Infer<E["response"]> : unknown;

// ── State ────────────────────────────────────────────────────────────────────

export interface QueryState<T> {
  data: T | null;
  isPending: boolean;
  error: Error | null;
  isFetching: boolean;
}

export interface MutationHandle<TInput, TOutput> {
  data: TOutput | null;
  isPending: boolean;
  error: Error | null;
  mutate: (input: TInput) => Promise<TOutput>;
  reset: () => void;
}

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

// ── Error ────────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

// ── Cache entry ──────────────────────────────────────────────────────────────

export interface QueryEntry<T = unknown> {
  $state: ReadableAtom<QueryState<T>>;
  queryKey: string;
  fetchedAt: number;
  subscribers: number;
  staleTime: number;
  fetch: () => Promise<void>;
  gcTimer: ReturnType<typeof setTimeout> | null;
}

// ── Fetcher input (always this shape) ────────────────────────────────────────

export interface FetchInput {
  body?: unknown;
  query?: unknown;
  params?: Record<string, string>;
}

// ── Client type (what Proxy returns) ─────────────────────────────────────────

type NamespaceApi<E extends EndpointMap> = {
  useQuery: <K extends string & keyof E>(
    key: K,
    ...args: ResolvedInput<E[K]> extends void
      ? [input?: void, opts?: { enabled?: boolean }]
      : [input: ResolvedInput<E[K]>, opts?: { enabled?: boolean }]
  ) => QueryState<InferResponse<E[K]>>;

  useMutation: <K extends string & keyof E>(
    key: K,
  ) => MutationHandle<ResolvedInput<E[K]>, InferResponse<E[K]>>;
} & {
  [K in string & keyof E]: (
    ...args: ResolvedInput<E[K]> extends void ? [] : [input: ResolvedInput<E[K]>]
  ) => Promise<InferResponse<E[K]>>;
};

export type ApiClient<T extends NamespacedEndpoints> = {
  [NS in string & keyof T]: NamespaceApi<T[NS]>;
};

// ── Hook factory (framework adapters implement this) ─────────────────────────

export interface HookFactory {
  useQuery(namespace: string, key: string, endpoint: EndpointDef, input: FetchInput | undefined, opts?: { enabled?: boolean }): QueryState<unknown>;
  useMutation(namespace: string, key: string, endpoint: EndpointDef): MutationHandle<unknown, unknown>;
}
