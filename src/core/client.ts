import type { ClientOptions, InfiniteQueryOptions, MutationOptions, NamespacedEndpoints } from "./types";
import { HttpClient } from "./http-client";
import { RequestPipeline } from "./request-pipeline";
import { QueryCache } from "./cache";
import { buildEndpointTree, type EndpointTree, type EndpointNode } from "./endpoint";
import { createQuery, type Query } from "./query";
import { createMutation, type Mutation } from "./mutation";
import { createInfiniteQuery, type InfiniteQuery } from "./infinite-query";

export interface Client<T extends NamespacedEndpoints> {
  readonly endpoints: EndpointTree<T>;
  readonly cache: QueryCache;
  readonly pipeline: RequestPipeline;
  query<I, O>(endpoint: EndpointNode<I, O>, input: I): Query<I, O>;
  mutation<I, O>(endpoint: EndpointNode<I, O>, opts?: MutationOptions<I, O>): Mutation<I, O>;
  infiniteQuery<I, O>(endpoint: EndpointNode<I, O>, opts: InfiniteQueryOptions<I>): InfiniteQuery<I, O>;
}

/**
 * The vanilla client. Endpoints live at `client.endpoints.<namespace>.<name>`
 * and operations (query, mutation, infiniteQuery) live on the root client.
 * This eliminates namespace collisions — an endpoint named "query" or "fetch"
 * is just an EndpointNode like any other.
 */
export type VanillaClient<T extends NamespacedEndpoints> = Client<T> & EndpointTree<T>;

export function createClient<T extends NamespacedEndpoints>(options: ClientOptions<T>): VanillaClient<T> {
  const http = new HttpClient({
    baseURL: options.baseURL,
    credentials: options.credentials,
    headers: options.headers,
    onError: options.onError,
  });
  const pipeline = new RequestPipeline(http, { retry: options.retry });
  const cache = new QueryCache(options.cache);
  const endpoints = buildEndpointTree(options.endpoints, pipeline);

  const client: Client<T> = {
    endpoints,
    cache,
    pipeline,
    query: (endpoint, input) => createQuery(endpoint, input, cache, pipeline),
    mutation: (endpoint, opts) => createMutation(endpoint, cache, opts),
    infiniteQuery: (endpoint, opts) => createInfiniteQuery(endpoint, cache, opts),
  };

  // Attach endpoint tree namespaces on the root for ergonomics:
  //   client.users.get.call(...)
  return Object.assign(client, endpoints) as VanillaClient<T>;
}
