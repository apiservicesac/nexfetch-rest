import type { ApiClientType, ClientOptions, NamespacedEndpoints } from "../core/types";
import { Fetcher } from "../core/fetcher";
import { QueryCache } from "../core/cache";
import { createNamespaceProxy } from "../core/proxy";
import { createReactHooks } from "./hooks";

/**
 * Create a type-safe API client for React with built-in cache, dedup, retry, and stale-while-revalidate.
 *
 * @example
 * ```typescript
 * const api = createApiClient({
 *   baseURL: "https://api.example.com",
 *   credentials: "include",
 *   cache: { staleTime: 30_000 },
 *   endpoints: { projects: projectEndpoints },
 * });
 *
 * // In components:
 * const { data, isPending } = api.projects.useQuery("list", { orgId });
 * const create = api.projects.useMutation("create");
 * await create.mutate({ name: "New project" });
 * ```
 */
export function createApiClient<T extends NamespacedEndpoints>(options: ClientOptions<T>) {
  const fetcher = new Fetcher({
    baseURL: options.baseURL,
    credentials: options.credentials,
    headers: options.headers,
    retry: options.retry,
    onError: options.onError,
  });

  const cache = new QueryCache(options.cache);
  const hooks = createReactHooks(fetcher, cache);

  return createNamespaceProxy(options.endpoints, fetcher, hooks) as ApiClientType<T>;
}
