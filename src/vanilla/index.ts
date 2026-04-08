import { atom } from "nanostores";
import type { ClientOptions, EndpointDef, FetchInput, MutationHandle, NamespacedEndpoints, QueryEntry } from "../core/types";
import { Fetcher } from "../core/fetcher";
import { QueryCache } from "../core/cache";

export function createApiClient<T extends NamespacedEndpoints>(options: ClientOptions<T>) {
  const fetcher = new Fetcher({ baseURL: options.baseURL, credentials: options.credentials, headers: options.headers, retry: options.retry, onError: options.onError });
  const cache = new QueryCache(options.cache);

  return new Proxy({} as Record<string, unknown>, {
    get(_, namespace: string) {
      const nsEndpoints = options.endpoints[namespace];
      if (!nsEndpoints) return undefined;
      return {
        query: (key: string, input?: FetchInput): QueryEntry => {
          const endpoint = nsEndpoints[key] as EndpointDef;
          const queryKey = input ? `${namespace}.${key}:${JSON.stringify(input)}` : `${namespace}.${key}`;
          return cache.getOrCreate(queryKey, () => fetcher.request(endpoint, input), { staleTime: endpoint.staleTime, tags: endpoint.tags, transform: endpoint.transform });
        },
        mutation: (key: string): MutationHandle<unknown, unknown> => {
          const endpoint = nsEndpoints[key] as EndpointDef;
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
        },
        fetch: (key: string, input?: FetchInput) => fetcher.request(nsEndpoints[key] as EndpointDef, input),
        invalidateByTag: (tag: string) => cache.invalidateByTag(tag),
      };
    },
  });
}
