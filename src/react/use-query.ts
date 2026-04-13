import { useEffect, useMemo } from "react";
import type { Client } from "../core/client";
import type { EndpointNode } from "../core/endpoint";
import type { QueryOptions, QueryState } from "../core/types";
import { stableHash } from "../core/key";
import { useObservable } from "./use-observable";

export function useQuery<I, O, Sel = O>(
  client: Client<any>,
  endpoint: EndpointNode<I, O>,
  input: I,
  opts?: QueryOptions<O, Sel>,
): QueryState<Sel> {
  const inputKey = stableHash(input);
  const enabled = opts?.enabled ?? true;

  const query = useMemo(
    () => (enabled ? client.query(endpoint, input) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [endpoint, inputKey, enabled],
  );

  useEffect(() => {
    return () => query?.dispose();
  }, [query]);

  useEffect(() => {
    if (!query || !opts?.refetchInterval) return;
    const timer = setInterval(() => void query.refetch(), opts.refetchInterval);
    return () => clearInterval(timer);
  }, [query, opts?.refetchInterval]);

  const projected = useMemo(() => {
    if (!query) return null;
    return opts?.select ? query.project(opts.select) : (query.state as unknown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, opts?.select]);

  const state = useObservable((projected ?? EMPTY_STATE) as any) as QueryState<Sel>;
  return state;
}

const EMPTY_STATE = {
  get: () => ({ data: undefined, error: undefined, status: "idle" as const, isFetching: false }),
  subscribe: () => () => {},
};
