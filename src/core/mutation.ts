import { atom } from "nanostores";
import type { EndpointDef, InferMutationInput, InferResponse, MutationHandle, MutationState } from "./types";
import type { Fetcher } from "./fetcher";
import type { QueryCache } from "./cache";

export function createMutation<E extends EndpointDef>(
  fetcher: Fetcher,
  cache: QueryCache,
  endpoint: E,
  namespace: string,
  _endpointKey: string,
): MutationHandle<InferMutationInput<E>, InferResponse<E>> {
  type TInput = InferMutationInput<E>;
  type TOutput = InferResponse<E>;

  const $state = atom<MutationState<TOutput>>({
    data: null,
    isPending: false,
    error: null,
  });

  const mutate = async (input: TInput): Promise<TOutput> => {
    $state.set({ data: null, isPending: true, error: null });
    try {
      // Extract body, params, query from the combined input
      const parts = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
      const data = await fetcher.request<TOutput>(endpoint, {
        body: parts.body,
        query: parts.query,
        params: parts.params as Record<string, string> | undefined,
      });
      $state.set({ data, isPending: false, error: null });

      if (endpoint.invalidate) {
        for (const key of endpoint.invalidate) cache.invalidate(key);
      } else {
        cache.invalidate(namespace);
      }

      return data;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      $state.set({ data: null, isPending: false, error: err });
      throw err;
    }
  };

  const reset = () => $state.set({ data: null, isPending: false, error: null });

  return {
    get data() { return $state.get().data; },
    get isPending() { return $state.get().isPending; },
    get error() { return $state.get().error; },
    mutate,
    reset,
    $state,
  } as MutationHandle<TInput, TOutput>;
}
