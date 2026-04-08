import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { atom } from "nanostores";
import type { ReadableAtom } from "nanostores";
import type { EndpointDef, FetchInput, HookFactory, InfiniteQueryOptions, InfiniteQueryState, MutationHandle, QueryOptions, QueryState } from "../core/types";
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
  return input ? `${namespace}.${key}:${JSON.stringify(input)}` : `${namespace}.${key}`;
}

export function createReactHooks(fetcher: Fetcher, cache: QueryCache): HookFactory {
  return {
    useQuery(namespace: string, key: string, endpoint: EndpointDef, input?: FetchInput, opts?: QueryOptions): QueryState<unknown> {
      const enabled = opts?.enabled ?? true;
      const queryKey = useMemo(() => buildKey(namespace, key, input), [namespace, key, JSON.stringify(input)]);

      const entry = useMemo(() => {
        if (!enabled) return null;
        return cache.getOrCreate(queryKey, () => fetcher.request(endpoint, input), {
          staleTime: endpoint.staleTime,
          tags: endpoint.tags,
          transform: endpoint.transform,
          select: opts?.select,
        });
      }, [queryKey, enabled]);

      useEffect(() => { if (entry) return cache.subscribe(entry.queryKey); }, [entry]);
      useEffect(() => { if (entry) cache.ensureFresh(entry.queryKey); }, [entry]);

      // Polling
      useEffect(() => {
        if (!entry || !opts?.refetchInterval) return;
        const timer = setInterval(() => cache.ensureFresh(entry.queryKey), opts.refetchInterval);
        return () => clearInterval(timer);
      }, [entry, opts?.refetchInterval]);

      if (!entry) return { data: null, isPending: false, error: null, isFetching: false };
      return useAtom(entry.$state);
    },

    useMutation(namespace: string, key: string, endpoint: EndpointDef): MutationHandle<unknown, unknown> {
      const $state = useMemo(() => atom<{ data: unknown; isPending: boolean; error: Error | null }>({ data: null, isPending: false, error: null }), [namespace, key]);

      const mutate = useCallback(async (input: unknown, opts?: { onSuccess?: (data: unknown) => void; onError?: (err: Error) => void }) => {
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
      }, [namespace, key]);

      const reset = useCallback(() => $state.set({ data: null, isPending: false, error: null }), []);
      const state = useAtom($state);
      return { ...state, mutate, reset } as MutationHandle<unknown, unknown>;
    },

    useInfiniteQuery(namespace: string, key: string, endpoint: EndpointDef, opts: InfiniteQueryOptions): InfiniteQueryState<unknown> {
      const enabled = opts.enabled ?? true;
      const [pages, setPages] = useState<unknown[][]>([]);
      const [isPending, setIsPending] = useState(true);
      const [isFetchingMore, setIsFetchingMore] = useState(false);
      const [hasMore, setHasMore] = useState(true);
      const [error, setError] = useState<Error | null>(null);
      const pageParam = opts.pageParam ?? "page";

      const fetchPage = useCallback(async (pageValue: unknown): Promise<unknown[]> => {
        const input: FetchInput = {
          query: { ...opts.query, [pageParam]: String(pageValue) },
          params: opts.params,
        };
        let data = await fetcher.request(endpoint, input);
        if (endpoint.transform) data = endpoint.transform(data);
        return data as unknown[];
      }, [namespace, key, JSON.stringify(opts.query), JSON.stringify(opts.params)]);

      // Initial fetch
      useEffect(() => {
        if (!enabled) return;
        setIsPending(true);
        fetchPage(1).then((firstPage) => {
          setPages([firstPage]);
          setHasMore(opts.getNextPageParam(firstPage, [firstPage]) !== undefined);
          setIsPending(false);
        }).catch((err) => { setError(err instanceof Error ? err : new Error(String(err))); setIsPending(false); });
      }, [enabled, fetchPage]);

      const fetchNext = useCallback(async () => {
        if (!hasMore || isFetchingMore) return;
        const nextParam = opts.getNextPageParam(pages.at(-1) ?? [], pages);
        if (nextParam === undefined) { setHasMore(false); return; }
        setIsFetchingMore(true);
        try {
          const page = await fetchPage(nextParam);
          const newPages = [...pages, page];
          setPages(newPages);
          setHasMore(opts.getNextPageParam(page, newPages) !== undefined);
        } catch (err) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
        setIsFetchingMore(false);
      }, [pages, hasMore, isFetchingMore, fetchPage]);

      const data = useMemo(() => {
        const flat = pages.flat();
        return opts.select ? opts.select(pages) : flat;
      }, [pages, opts.select]) as unknown[];

      return { data, pages, isPending, error, isFetchingMore, hasMore, fetchNext };
    },
  };
}
