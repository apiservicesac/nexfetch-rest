import { useCallback, useEffect, useMemo } from "react";
import type { Client } from "../core/client";
import type { EndpointNode } from "../core/endpoint";
import type { InfiniteQueryOptions, InfiniteQueryState } from "../core/types";
import { stableHash } from "../core/key";
import { useObservable } from "./use-observable";

export interface UseInfiniteQueryResult<O> extends InfiniteQueryState<O> {
  fetchNext: () => Promise<void>;
  refetch: () => Promise<void>;
}

export function useInfiniteQuery<I, O>(
  client: Client<any>,
  endpoint: EndpointNode<I, O>,
  opts: InfiniteQueryOptions<I>,
): UseInfiniteQueryResult<O> {
  const optsKey = stableHash(opts);
  const inf = useMemo(
    () => client.infiniteQuery(endpoint, opts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [endpoint, optsKey],
  );

  useEffect(() => () => inf.dispose(), [inf]);

  const state = useObservable(inf.state);
  const fetchNext = useCallback(() => inf.fetchNext(), [inf]);
  const refetch = useCallback(() => inf.refetch(), [inf]);

  return { ...state, fetchNext, refetch };
}
