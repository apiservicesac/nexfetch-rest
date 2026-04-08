import { atom } from "nanostores";
import type { EndpointDef, QueryEntry, QueryState, InferResponse } from "./types";
import type { Fetcher } from "./fetcher";

export function createQueryEntry<E extends EndpointDef>(
  fetcher: Fetcher,
  endpoint: E,
  queryKey: string,
  input: unknown,
  staleTime: number,
): QueryEntry<InferResponse<E>> {
  type TResponse = InferResponse<E>;

  const $state = atom<QueryState<TResponse>>({
    data: null,
    isPending: true,
    error: null,
    isFetching: true,
  });

  const fetchData = async () => {
    const current = $state.get();
    // Stale-while-revalidate: keep old data visible, set isFetching
    $state.set({ ...current, isFetching: true, error: null, isPending: current.data === null });

    try {
      const data = await fetcher.request<TResponse>(endpoint, { query: input });
      $state.set({ data, isPending: false, error: null, isFetching: false });
      entry.fetchedAt = Date.now();
    } catch (error) {
      $state.set({
        ...current,
        isPending: false,
        isFetching: false,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  };

  const entry: QueryEntry<TResponse> = {
    $state,
    queryKey,
    fetchedAt: 0,
    subscribers: 0,
    staleTime,
    fetch: fetchData,
    gcTimer: null,
  };

  // Auto-fetch on creation
  fetchData();

  return entry;
}
