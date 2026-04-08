import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { ReadableAtom } from "nanostores";
import type { EndpointDef, HookFactory, InferBody, InferResponse, MutationHandle, QueryState } from "../core/types";
import type { QueryCache } from "../core/cache";
import type { Fetcher } from "../core/fetcher";
import { createMutation } from "../core/mutation";

function useAtom<T>(atom: ReadableAtom<T>): T {
  return useSyncExternalStore(
    useCallback((callback) => atom.subscribe(callback), [atom]),
    () => atom.get(),
    () => atom.get(),
  );
}

function buildQueryKey(namespace: string, endpointKey: string, input: unknown): string {
  const base = `${namespace}.${endpointKey}`;
  if (input === undefined || input === null) return base;
  return `${base}:${JSON.stringify(input)}`;
}

export function createReactHooks(fetcher: Fetcher, cache: QueryCache): HookFactory {
  return {
    useQuery<E extends EndpointDef>(
      namespace: string,
      endpointKey: string,
      endpoint: E,
      input?: unknown,
      options?: { enabled?: boolean },
    ): QueryState<InferResponse<E>> {
      const enabled = options?.enabled ?? true;
      const queryKey = useMemo(() => buildQueryKey(namespace, endpointKey, input), [namespace, endpointKey, input]);

      const entry = useMemo(() => {
        if (!enabled) return null;
        return cache.getOrCreate(queryKey, fetcher, endpoint, input);
      }, [queryKey, enabled]);

      // Subscribe for GC tracking
      useEffect(() => {
        if (!entry) return;
        return cache.subscribe(entry.queryKey);
      }, [entry]);

      // Stale-while-revalidate
      useEffect(() => {
        if (entry) cache.ensureFresh(entry.queryKey);
      }, [entry]);

      if (!entry) {
        return { data: null, isPending: false, error: null, isFetching: false };
      }

      return useAtom(entry.$state);
    },

    useMutation<E extends EndpointDef>(
      namespace: string,
      endpointKey: string,
      endpoint: E,
    ): MutationHandle<InferBody<E>, InferResponse<E>> {
      return useMemo(
        () => createMutation(fetcher, cache, endpoint, namespace, endpointKey),
        [namespace, endpointKey],
      );
    },
  };
}
