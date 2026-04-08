import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { atom } from "nanostores";
import type { ReadableAtom } from "nanostores";
import type { EndpointDef, FetchInput, HookFactory, MutationHandle, QueryState } from "../core/types";
import type { Fetcher } from "../core/fetcher";
import type { QueryCache } from "../core/cache";

function useAtom<T>(store: ReadableAtom<T>): T {
  return useSyncExternalStore(
    useCallback((cb) => store.subscribe(cb), [store]),
    () => store.get(),
    () => store.get(),
  );
}

function buildKey(namespace: string, key: string, input?: FetchInput): string {
  const base = `${namespace}.${key}`;
  if (!input) return base;
  return `${base}:${JSON.stringify(input)}`;
}

export function createReactHooks(fetcher: Fetcher, cache: QueryCache): HookFactory {
  return {
    useQuery(namespace: string, key: string, endpoint: EndpointDef, input?: FetchInput, opts?: { enabled?: boolean }): QueryState<unknown> {
      const enabled = opts?.enabled ?? true;
      const queryKey = useMemo(() => buildKey(namespace, key, input), [namespace, key, JSON.stringify(input)]);

      const entry = useMemo(() => {
        if (!enabled) return null;
        return cache.getOrCreate(queryKey, () => fetcher.request(endpoint, input), endpoint.staleTime);
      }, [queryKey, enabled]);

      useEffect(() => {
        if (!entry) return;
        return cache.subscribe(entry.queryKey);
      }, [entry]);

      useEffect(() => {
        if (entry) cache.ensureFresh(entry.queryKey);
      }, [entry]);

      if (!entry) return { data: null, isPending: false, error: null, isFetching: false };
      return useAtom(entry.$state);
    },

    useMutation(namespace: string, key: string, endpoint: EndpointDef): MutationHandle<unknown, unknown> {
      const $state = useMemo(() => atom<{ data: unknown; isPending: boolean; error: Error | null }>({ data: null, isPending: false, error: null }), [namespace, key]);

      const mutate = useCallback(async (input: unknown) => {
        $state.set({ data: null, isPending: true, error: null });
        try {
          const data = await fetcher.request(endpoint, input as FetchInput);
          $state.set({ data, isPending: false, error: null });
          for (const prefix of endpoint.invalidate ?? [namespace]) cache.invalidate(prefix);
          return data;
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          $state.set({ data: null, isPending: false, error: err });
          throw err;
        }
      }, [namespace, key]);

      const reset = useCallback(() => $state.set({ data: null, isPending: false, error: null }), []);
      const state = useAtom($state);

      return { ...state, mutate, reset } as MutationHandle<unknown, unknown>;
    },
  };
}
