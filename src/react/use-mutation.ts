import { useCallback, useMemo } from "react";
import type { Client } from "../core/client";
import type { EndpointNode } from "../core/endpoint";
import type { MutateOptions, MutationState } from "../core/types";
import { useObservable } from "./use-observable";

export interface UseMutationResult<I, O> extends MutationState<O> {
  mutate: (input: I, opts?: MutateOptions<O>) => Promise<O>;
  reset: () => void;
}

export function useMutation<I, O>(
  client: Client<any>,
  endpoint: EndpointNode<I, O>,
): UseMutationResult<I, O> {
  const mutation = useMemo(() => client.mutation(endpoint), [endpoint]);
  const state = useObservable(mutation.state);

  const mutate = useCallback(
    (input: I, opts?: MutateOptions<O>) => mutation.mutate(input, {
      onSuccess: opts?.onSuccess ? (data) => opts.onSuccess!(data) : undefined,
      onError: opts?.onError ? (err) => opts.onError!(err) : undefined,
    }),
    [mutation],
  );

  const reset = useCallback(() => mutation.reset(), [mutation]);

  return { ...state, mutate, reset };
}
