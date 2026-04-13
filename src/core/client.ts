import { atom } from "nanostores";
import type { ApiClient, ClientOptions, EndpointDef, FetchInput, HookFactory, InfiniteQueryOptions, MutationHandle, NamespacedEndpoints, QueryOptions } from "./types";
import { Fetcher } from "./fetcher";
import { QueryCache } from "./cache";

export function createClient<T extends NamespacedEndpoints>(
  options: ClientOptions<T>,
  hooks?: HookFactory,
  runtime?: { fetcher: Fetcher; cache: QueryCache },
): ApiClient<T> {
  const fetcher = runtime?.fetcher ?? new Fetcher({
    baseURL: options.baseURL,
    credentials: options.credentials,
    headers: options.headers,
    retry: options.retry,
    onError: options.onError,
  });
  const cache = runtime?.cache ?? new QueryCache(options.cache);

  return new Proxy({} as Record<string, unknown>, {
    get(_, namespace: string) {
      const nsEndpoints = options.endpoints[namespace];
      if (!nsEndpoints) return undefined;

      return new Proxy({} as Record<string, unknown>, {
        get(_, method: string) {
          // ── React hooks ───────────────────────────────────────────
          if (method === "useQuery") {
            return (key: string, input?: FetchInput, opts?: QueryOptions) => {
              if (!hooks) throw new Error('React hooks are not available. Use createApiClient from "nexfetch-rest/react".');
              const endpoint = nsEndpoints[key] as EndpointDef;
              if (!endpoint) throw new Error(`Endpoint "${namespace}.${key}" not found`);
              return hooks.useQuery(namespace, key, endpoint, input, opts);
            };
          }
          if (method === "useMutation") {
            return (key: string) => {
              if (!hooks) throw new Error('React hooks are not available. Use createApiClient from "nexfetch-rest/react".');
              const endpoint = nsEndpoints[key] as EndpointDef;
              if (!endpoint) throw new Error(`Endpoint "${namespace}.${key}" not found`);
              return hooks.useMutation(namespace, key, endpoint);
            };
          }
          if (method === "useInfiniteQuery") {
            return (key: string, opts: InfiniteQueryOptions) => {
              if (!hooks) throw new Error('React hooks are not available. Use createApiClient from "nexfetch-rest/react".');
              const endpoint = nsEndpoints[key] as EndpointDef;
              if (!endpoint) throw new Error(`Endpoint "${namespace}.${key}" not found`);
              return hooks.useInfiniteQuery(namespace, key, endpoint, opts);
            };
          }

          // ── Vanilla operations ────────────────────────────────────
          if (method === "query") {
            return (key: string, input?: FetchInput) => {
              const endpoint = nsEndpoints[key] as EndpointDef;
              if (!endpoint) throw new Error(`Endpoint "${namespace}.${key}" not found`);
              const queryKey = input ? `${namespace}.${key}:${JSON.stringify(input)}` : `${namespace}.${key}`;
              return cache.getOrCreate(queryKey, () => fetcher.request(endpoint, input), {
                staleTime: endpoint.staleTime, tags: endpoint.tags, transform: endpoint.transform,
              });
            };
          }
          if (method === "mutation") {
            return (key: string): MutationHandle<unknown, unknown> => {
              const endpoint = nsEndpoints[key] as EndpointDef;
              if (!endpoint) throw new Error(`Endpoint "${namespace}.${key}" not found`);
              const $state = atom<{ data: unknown; isPending: boolean; error: Error | null }>({ data: null, isPending: false, error: null });
              return {
                get data() { return $state.get().data; },
                get isPending() { return $state.get().isPending; },
                get error() { return $state.get().error; },
                mutate: async (input: unknown, opts?: { onSuccess?: (data: unknown) => void; onError?: (err: Error) => void }) => {
                  $state.set({ data: null, isPending: true, error: null });
                  try {
                    const data = await fetcher.request(endpoint, input as FetchInput);
                    $state.set({ data, isPending: false, error: null });
                    for (const tag of endpoint.invalidates ?? []) cache.invalidateByTag(tag);
                    opts?.onSuccess?.(data);
                    return data;
                  } catch (error) {
                    const err = error instanceof Error ? error : new Error(String(error));
                    $state.set({ data: null, isPending: false, error: err });
                    opts?.onError?.(err);
                    throw err;
                  }
                },
                reset: () => $state.set({ data: null, isPending: false, error: null }),
              };
            };
          }
          if (method === "fetch") {
            return (key: string, input?: FetchInput) => {
              const endpoint = nsEndpoints[key] as EndpointDef;
              if (!endpoint) throw new Error(`Endpoint "${namespace}.${key}" not found`);
              return fetcher.request(endpoint, input);
            };
          }
          if (method === "invalidateByTag") {
            return (tag: string) => cache.invalidateByTag(tag);
          }

          // ── Direct endpoint call (e.g. api.users.getById(input)) ─
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
