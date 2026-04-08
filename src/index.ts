export type {
  Schema,
  EndpointDef,
  EndpointMap,
  NamespacedEndpoints,
  ClientOptions,
  CacheConfig,
  RetryConfig,
  FetchInput,
  QueryState,
  QueryOptions,
  MutationHandle,
  MutateOptions,
  InfiniteQueryState,
  InfiniteQueryOptions,
  QueryEntry,
  ResolvedInput,
  InferResponse,
  ApiClient,
  HookFactory,
} from "./core/types";

export { ApiError } from "./core/types";
export { defineEndpoints } from "./schema/define";
export { Fetcher } from "./core/fetcher";
export { QueryCache } from "./core/cache";
export { createClient } from "./core/client";
