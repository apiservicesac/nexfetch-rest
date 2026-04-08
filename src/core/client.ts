import type { ApiClient, ClientOptions, EndpointDef, FetchInput, HookFactory, InfiniteQueryOptions, NamespacedEndpoints, QueryOptions } from "./types";
import { Fetcher } from "./fetcher";
import { QueryCache } from "./cache";

export function createClient<T extends NamespacedEndpoints>(
  options: ClientOptions<T>,
  hooks: HookFactory,
): ApiClient<T> {
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

      return new Proxy({} as Record<string, unknown>, {
        get(_, method: string) {
          if (method === "useQuery") {
            return (key: string, input?: FetchInput, opts?: QueryOptions) => {
              const endpoint = nsEndpoints[key] as EndpointDef;
              if (!endpoint) throw new Error(`Endpoint "${namespace}.${key}" not found`);
              return hooks.useQuery(namespace, key, endpoint, input, opts);
            };
          }
          if (method === "useMutation") {
            return (key: string) => {
              const endpoint = nsEndpoints[key] as EndpointDef;
              if (!endpoint) throw new Error(`Endpoint "${namespace}.${key}" not found`);
              return hooks.useMutation(namespace, key, endpoint);
            };
          }
          if (method === "useInfiniteQuery") {
            return (key: string, opts: InfiniteQueryOptions) => {
              const endpoint = nsEndpoints[key] as EndpointDef;
              if (!endpoint) throw new Error(`Endpoint "${namespace}.${key}" not found`);
              return hooks.useInfiniteQuery(namespace, key, endpoint, opts);
            };
          }
          const endpoint = nsEndpoints[method] as EndpointDef | undefined;
          if (endpoint) return (input?: FetchInput) => fetcher.request(endpoint, input);
          return undefined;
        },
      });
    },
  }) as ApiClient<T>;
}

export { Fetcher } from "./fetcher";
export { QueryCache } from "./cache";
