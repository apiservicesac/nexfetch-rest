// Core types
export type {
  EndpointDef,
  EndpointMap,
  NamespacedEndpoints,
  ClientOptions,
  CacheConfig,
  RetryConfig,
  QueryState,
  MutationState,
  MutationHandle,
  InferBody,
  InferQuery,
  InferParams,
  InferResponse,
  QueryEntry,
  HookFactory,
  ApiClientType,
} from "./core/types";

export { ApiError } from "./core/types";

// Schema definition
export { defineEndpoints } from "./schema/define";

// Core (for building custom adapters)
export { QueryCache } from "./core/cache";
export { Fetcher } from "./core/fetcher";
export { createNamespaceProxy } from "./core/proxy";
export { createCoreClient } from "./core/client";
export { createQueryEntry } from "./core/query";
export { createMutation } from "./core/mutation";
