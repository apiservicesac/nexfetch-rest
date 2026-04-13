import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { atom } from "nanostores";
import type { ReadableAtom } from "nanostores";
import type {
  EndpointDef, FetchInput, HookFactory, InfiniteQueryOptions,
  InfiniteQueryState, MutationHandle, QueryOptions, QueryState,
} from "../core/types";
import type { Fetcher } from "../core/fetcher";
import type { QueryCache } from "../core/cache";
import { buildQueryKey, INITIAL_MUTATION_STATE, type MutationState, toError } from "../core/utils";

function useAtom<T>(store: ReadableAtom<T>): T {
  return useSyncExternalStore(
    useCallback((cb) => store.subscribe(cb), [store]),
    () => store.get(),
    () => store.get(),
  );
}

export function createReactHooks(fetcher: Fetcher, cache: QueryCache): HookFactory {
  return {
    useQuery(
      namespace: string,
      key: string,
      endpoint: EndpointDef,
      input?: FetchInput,
      opts?: QueryOptions,
    ): QueryState<unknown> {
      const enabled = opts?.enabled ?? true;
      const queryKey = useMemo(
        () => buildQueryKey(namespace, key, input),
        [namespace, key, JSON.stringify(input)],
      );

      const entry = useMemo(() => {
        if (!enabled) return null;
        return cache.getOrCreate(queryKey, () => fetcher.request(endpoint, input), {
          staleTime: endpoint.staleTime,
          tags: endpoint.tags,
          transform: endpoint.transform,
          select: opts?.select,
        });
      }, [queryKey, enabled]);

      useEffect(() => {
        if (entry) return cache.subscribe(entry.queryKey);
      }, [entry]);

      useEffect(() => {
        if (entry) cache.ensureFresh(entry.queryKey);
      }, [entry]);

      useEffect(() => {
        if (!entry || !opts?.refetchInterval) return;
        const timer = setInterval(() => cache.ensureFresh(entry.queryKey), opts.refetchInterval);
        return () => clearInterval(timer);
      }, [entry, opts?.refetchInterval]);

      if (!entry) return { data: null, isPending: false, error: null, isFetching: false };
      return useAtom(entry.$state);
    },

    useMutation(
      namespace: string,
      key: string,
      endpoint: EndpointDef,
    ): MutationHandle<unknown, unknown> {
      const $state = useMemo(
        () => atom<MutationState>({ ...INITIAL_MUTATION_STATE }),
        [namespace, key],
      );

      const mutate = useCallback(async (
        input: unknown,
        opts?: { onSuccess?: (data: unknown) => void; onError?: (err: Error) => void },
      ) => {
        $state.set({ ...INITIAL_MUTATION_STATE, isPending: true });
        try {
          const data = await fetcher.request(endpoint, input as FetchInput);
          $state.set({ data, isPending: false, error: null });
          for (const tag of endpoint.invalidates ?? []) cache.invalidateByTag(tag);
          opts?.onSuccess?.(data);
          return data;
        } catch (error) {
          const err = toError(error);
          $state.set({ data: null, isPending: false, error: err });
          opts?.onError?.(err);
          throw err;
        }
      }, [namespace, key]);

      const reset = useCallback(
        () => $state.set({ ...INITIAL_MUTATION_STATE }),
        [],
      );

      const state = useAtom($state);
      return { ...state, mutate, reset } as MutationHandle<unknown, unknown>;
    },

    useInfiniteQuery(
      namespace: string,
      key: string,
      endpoint: EndpointDef,
      opts: InfiniteQueryOptions,
    ): InfiniteQueryState<unknown> {
      const enabled = opts.enabled ?? true;
      const [pages, setPages] = useState<unknown[][]>([]);
      const [rawResponses, setRawResponses] = useState<unknown[]>([]);
      const [isPending, setIsPending] = useState(true);
      const [isFetchingMore, setIsFetchingMore] = useState(false);
      const [hasMore, setHasMore] = useState(true);
      const [error, setError] = useState<Error | null>(null);
      const [pageNumber, setPageNumber] = useState(1);
      const [cursor, setCursor] = useState<unknown>(undefined);
      const { pagination } = opts;

      const fetchPage = useCallback(async (pageOrCursor: unknown) => {
        const queryParams: Record<string, unknown> = { ...opts.query };

        if (pagination.type === "offset" || pagination.type === "total") {
          queryParams[pagination.pageParam ?? "page"] = String(pageOrCursor);
        } else if (pagination.type === "cursor" && pageOrCursor !== undefined) {
          queryParams[pagination.cursorParam ?? "cursor"] = String(pageOrCursor);
        }

        let raw = await fetcher.request(endpoint, { query: queryParams, params: opts.params });
        if (endpoint.transform) raw = endpoint.transform(raw);

        const items = Array.isArray(raw)
          ? raw
          : (raw as Record<string, unknown>).data ?? raw;

        return { items: items as unknown[], raw };
      }, [namespace, key, JSON.stringify(opts.query), JSON.stringify(opts.params)]);

      const resolveHasMore = useCallback((items: unknown[], raw: unknown, currentPage: number): boolean => {
        if (pagination.type === "offset") {
          return items.length >= pagination.pageSize;
        }
        if (pagination.type === "cursor") {
          return (raw as Record<string, unknown>)?.[pagination.cursorField] != null;
        }
        if (pagination.type === "total") {
          const total = (raw as Record<string, unknown>)?.[pagination.totalField] as number ?? 0;
          return currentPage < Math.ceil(total / pagination.pageSize);
        }
        return false;
      }, [pagination]);

      useEffect(() => {
        if (!enabled) return;
        setIsPending(true);

        const initial = pagination.type === "cursor" ? undefined : 1;
        fetchPage(initial)
          .then(({ items, raw }) => {
            setPages([items]);
            setRawResponses([raw]);
            setPageNumber(1);
            if (pagination.type === "cursor") {
              setCursor((raw as Record<string, unknown>)?.[pagination.cursorField]);
            }
            setHasMore(resolveHasMore(items, raw, 1));
            setIsPending(false);
          })
          .catch((err) => {
            setError(toError(err));
            setIsPending(false);
          });
      }, [enabled, fetchPage]);

      const fetchNext = useCallback(async () => {
        if (!hasMore || isFetchingMore) return;
        setIsFetchingMore(true);

        try {
          const nextPageOrCursor = pagination.type === "cursor" ? cursor : pageNumber + 1;
          const { items, raw } = await fetchPage(nextPageOrCursor);
          const nextPage = pageNumber + 1;

          setPages((prev) => [...prev, items]);
          setRawResponses((prev) => [...prev, raw]);
          setPageNumber(nextPage);

          if (pagination.type === "cursor") {
            setCursor((raw as Record<string, unknown>)?.[pagination.cursorField]);
          }
          setHasMore(resolveHasMore(items, raw, nextPage));
        } catch (err) {
          setError(toError(err));
        }

        setIsFetchingMore(false);
      }, [pages, pageNumber, cursor, hasMore, isFetchingMore, fetchPage, resolveHasMore]);

      const data = useMemo(() => {
        const flat = pages.flat();
        return opts.select ? opts.select(pages) : flat;
      }, [pages, opts.select]) as unknown[];

      return { data, pages, isPending, error, isFetchingMore, hasMore, fetchNext };
    },
  };
}
