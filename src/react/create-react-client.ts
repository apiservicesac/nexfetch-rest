import type { ClientOptions, NamespacedEndpoints, QueryOptions, QueryState, InfiniteQueryOptions } from "../core/types";
import type { EndpointNode } from "../core/endpoint";
import { createClient, type VanillaClient } from "../core/client";
import { useQuery } from "./use-query";
import { useMutation, type UseMutationResult } from "./use-mutation";
import { useInfiniteQuery, type UseInfiniteQueryResult } from "./use-infinite-query";

export interface ReactClientExtensions {
  useQuery<I, O, Sel = O>(
    endpoint: EndpointNode<I, O>,
    input: I,
    opts?: QueryOptions<O, Sel>,
  ): QueryState<Sel>;

  useMutation<I, O>(endpoint: EndpointNode<I, O>): UseMutationResult<I, O>;

  useInfiniteQuery<I, O>(
    endpoint: EndpointNode<I, O>,
    opts: InfiniteQueryOptions<I>,
  ): UseInfiniteQueryResult<O>;
}

export type ReactClient<T extends NamespacedEndpoints> = VanillaClient<T> & ReactClientExtensions;

const REACT_RESERVED = new Set(["useQuery", "useMutation", "useInfiniteQuery"]);

export function createReactClient<T extends NamespacedEndpoints>(options: ClientOptions<T>): ReactClient<T> {
  const collisions = Object.keys(options.endpoints).filter((ns) => REACT_RESERVED.has(ns));
  if (collisions.length > 0) {
    throw new Error(`Endpoint namespace(s) collide with React client hooks: ${collisions.join(", ")}.`);
  }

  const client = createClient(options);

  const reactExtensions: ReactClientExtensions = {
    useQuery: (endpoint, input, opts) => useQuery(client, endpoint, input, opts),
    useMutation: (endpoint) => useMutation(client, endpoint),
    useInfiniteQuery: (endpoint, opts) => useInfiniteQuery(client, endpoint, opts),
  };

  return Object.assign(client, reactExtensions) as ReactClient<T>;
}
