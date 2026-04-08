import type { ClientOptions, NamespacedEndpoints } from "../core/types";
import { Fetcher } from "../core/fetcher";
import { QueryCache } from "../core/cache";
import { createMutation } from "../core/mutation";
import type { EndpointDef } from "../core/types";

/**
 * Create a vanilla (framework-agnostic) API client.
 * Returns nanostores atoms directly — subscribe to them in any framework.
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

  return new Proxy({} as Record<string, unknown>, {
    get(_, namespace: string) {
      const nsEndpoints = options.endpoints[namespace];
      if (!nsEndpoints) return undefined;

      return {
        query: (key: string, input?: unknown) => {
          const endpoint = nsEndpoints[key] as EndpointDef;
          const queryKey = input ? `${namespace}.${key}:${JSON.stringify(input)}` : `${namespace}.${key}`;
          return cache.getOrCreate(queryKey, fetcher, endpoint, input);
        },
        mutation: (key: string) => {
          const endpoint = nsEndpoints[key] as EndpointDef;
          return createMutation(fetcher, cache, endpoint, namespace, key);
        },
        fetch: (key: string, input?: { body?: unknown; query?: unknown; params?: Record<string, string> }) => {
          const endpoint = nsEndpoints[key];
          return fetcher.request(endpoint, input);
        },
        invalidate: (prefix?: string) => cache.invalidate(prefix ? `${namespace}.${prefix}` : namespace),
      };
    },
  });
}
