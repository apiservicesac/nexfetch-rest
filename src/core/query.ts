import type { Observable } from "./observable";
import { derived } from "./observable";
import type { CacheEntry, QueryCache } from "./cache";
import type { QueryState } from "./types";
import type { EndpointNode } from "./endpoint";
import { queryKeyOf } from "./key";
import type { RequestPipeline } from "./request-pipeline";

/**
 * Reactive cached query. Wraps a CacheEntry and exposes:
 *   - state: Observable<QueryState<O>>        — shared with the cache entry
 *   - project(fn): Observable<QueryState<Sel>> — per-subscription projection
 *   - refetch / invalidate / dispose
 */
export class Query<I, O> {
  private unsubscribe: () => void;

  constructor(
    private readonly entry: CacheEntry<O>,
    private readonly cache: QueryCache,
  ) {
    this.unsubscribe = this.cache.subscribe(this.entry.key);
    this.cache.ensureFresh(this.entry.key);
  }

  get state(): Observable<QueryState<O>> {
    return this.entry.state;
  }

  project<Sel>(select: (data: O) => Sel): Observable<QueryState<Sel>> {
    return derived(this.entry.state, (s) => ({
      ...s,
      data: s.data === undefined ? undefined : select(s.data),
    }));
  }

  refetch(): Promise<void> {
    return this.entry.fetch();
  }

  invalidate(): void {
    this.cache.invalidateByKey(this.entry.key);
  }

  dispose(): void {
    this.unsubscribe();
  }
}

export function createQuery<I, O>(
  endpoint: EndpointNode<I, O>,
  input: I,
  cache: QueryCache,
  _pipeline: RequestPipeline,
): Query<I, O> {
  const key = queryKeyOf(endpoint.path, input);
  const entry = cache.getOrCreate<O>(
    key,
    () => endpoint.call(input),
    {
      tags: endpoint.def.tags,
      staleTime: endpoint.def.staleTime,
    },
  );
  return new Query<I, O>(entry, cache);
}
