import type { ReadableAtom } from "nanostores";

// ── Schema interface (validator-agnostic) ────────────────────────────────────
// Any object with a .parse() method works: Zod, Valibot, Arktype, or custom.
// If no schema is provided, raw data is returned without validation.

export interface Schema<T = unknown> {
  parse(data: unknown): T;
}

type Infer<S> = S extends Schema<infer T> ? T : unknown;

// ── Endpoint Definition ──────────────────────────────────────────────────────

export interface EndpointDef<
  TBody = unknown,
  TQuery = unknown,
  TResponse = unknown,
  TParams = unknown,
> {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: Schema<TBody>;
  query?: Schema<TQuery>;
  params?: Schema<TParams>;
  response?: Schema<TResponse>;
  headers?: Record<string, string>;
  staleTime?: number;
  invalidate?: string[];
}

export type EndpointMap = Record<string, EndpointDef>;
export type NamespacedEndpoints = Record<string, EndpointMap>;

// ── Type Inference ───────────────────────────────────────────────────────────

export type InferBody<E extends EndpointDef> = E["body"] extends Schema ? Infer<E["body"]> : never;
export type InferQuery<E extends EndpointDef> = E["query"] extends Schema ? Infer<E["query"]> : never;
export type InferParams<E extends EndpointDef> = E["params"] extends Schema ? Infer<E["params"]> : never;
export type InferResponse<E extends EndpointDef> = E["response"] extends Schema ? Infer<E["response"]> : unknown;

// Mutation input: combines body + params + query into a single object
type MutationInputParts<E extends EndpointDef> =
  (E["body"] extends Schema ? { body: Infer<E["body"]> } : {}) &
  (E["params"] extends Schema ? { params: Infer<E["params"]> } : {}) &
  (E["query"] extends Schema ? { query: Infer<E["query"]> } : {});

// If the endpoint has no body, no params, and no query, input is void (no argument needed)
export type InferMutationInput<E extends EndpointDef> =
  E["body"] extends Schema ? MutationInputParts<E>
  : E["params"] extends Schema ? MutationInputParts<E>
  : E["query"] extends Schema ? MutationInputParts<E>
  : void;

// ── State ────────────────────────────────────────────────────────────────────

export interface QueryState<T> {
  data: T | null;
  isPending: boolean;
  error: Error | null;
  isFetching: boolean;
}

export interface MutationState<T> {
  data: T | null;
  isPending: boolean;
  error: Error | null;
}

export interface MutationHandle<TInput, TOutput> extends MutationState<TOutput> {
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

// ── Errors ───────────────────────────────────────────────────────────────────

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

// ── Query Entry (used by cache) ──────────────────────────────────────────────

export interface QueryEntry<T = unknown> {
  $state: ReadableAtom<QueryState<T>>;
  queryKey: string;
  fetchedAt: number;
  subscribers: number;
  staleTime: number;
  fetch: () => Promise<void>;
  gcTimer: ReturnType<typeof setTimeout> | null;
}

// ── Hook Factory ─────────────────────────────────────────────────────────────

export interface HookFactory {
  useQuery<E extends EndpointDef>(
    namespace: string,
    endpointKey: string,
    endpoint: E,
    input?: unknown,
    options?: { enabled?: boolean },
  ): QueryState<InferResponse<E>>;

  useMutation<E extends EndpointDef>(
    namespace: string,
    endpointKey: string,
    endpoint: E,
  ): MutationHandle<InferMutationInput<E>, InferResponse<E>>;
}

// ── Inferred Client Type ─────────────────────────────────────────────────────

type EndpointInput<E extends EndpointDef> =
  (E["body"] extends Schema ? { body: Infer<E["body"]> } : {}) &
  (E["query"] extends Schema ? { query: Infer<E["query"]> } : {}) &
  (E["params"] extends Schema ? { params: Infer<E["params"]> } : {});

type NamespaceApi<TEndpoints extends EndpointMap> = {
  useQuery: <K extends string & keyof TEndpoints>(
    key: K,
    ...args: TEndpoints[K]["query"] extends Schema
      ? [input: Infer<TEndpoints[K]["query"]>, options?: { enabled?: boolean }]
      : [input?: undefined, options?: { enabled?: boolean }]
  ) => QueryState<InferResponse<TEndpoints[K]>>;

  useMutation: <K extends string & keyof TEndpoints>(
    key: K,
  ) => MutationHandle<InferMutationInput<TEndpoints[K]>, InferResponse<TEndpoints[K]>>;
} & {
  [K in string & keyof TEndpoints]: (
    input?: EndpointInput<TEndpoints[K]>,
  ) => Promise<InferResponse<TEndpoints[K]>>;
};

export type ApiClientType<T extends NamespacedEndpoints> = {
  [NS in string & keyof T]: NamespaceApi<T[NS]>;
};
