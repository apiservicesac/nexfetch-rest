import { atom } from "nanostores";
import type { EndpointDef, InferBody, InferResponse, MutationHandle, MutationState } from "./types";
import type { Fetcher } from "./fetcher";
import type { QueryCache } from "./cache";

export function createMutation<E extends EndpointDef>(
  fetcher: Fetcher,
  cache: QueryCache,
  endpoint: E,
  namespace: string,
  endpointKey: string,
): MutationHandle<InferBody<E>, InferResponse<E>> {
  type TInput = InferBody<E>;
  type TOutput = InferResponse<E>;

  const $state = atom<MutationState<TOutput>>({
    data: null,
    isPending: false,
    error: null,
  });

  const mutate = async (input: TInput): Promise<TOutput> => {
    $state.set({ data: null, isPending: true, error: null });
    try {
      const data = await fetcher.request<TOutput>(endpoint, { body: input });
      $state.set({ data, isPending: false, error: null });

      // Auto-invalidate related queries
      if (endpoint.invalidate) {
        for (const key of endpoint.invalidate) {
          cache.invalidate(key);
        }
      } else {
        // Default: invalidate all queries in the same namespace
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
