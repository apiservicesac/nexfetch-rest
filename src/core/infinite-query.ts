import type { Observable } from "./observable";
import { observable } from "./observable";
import type { EndpointNode } from "./endpoint";
import type { QueryCache } from "./cache";
import type { InfiniteQueryOptions, InfiniteQueryState, PaginationConfig } from "./types";
import { queryKeyOf } from "./key";
import { toError } from "./errors";

const INITIAL: InfiniteQueryState<unknown> = {
  pages: [],
  flat: [],
  status: "idle",
  error: undefined,
  isFetchingMore: false,
  hasMore: true,
};

type Pagination = PaginationConfig;
type Raw = Record<string, unknown> | undefined;

const HAS_MORE: { [K in Pagination["type"]]: (items: unknown[], raw: Raw, page: number, cfg: Extract<Pagination, { type: K }>) => boolean } = {
  offset: (items, _r, _p, c) => items.length >= c.pageSize,
  cursor: (_i, raw, _p, c) => raw?.[c.cursorField] != null,
  total:  (_i, raw, page, c) => page < Math.ceil(((raw?.[c.totalField] as number) ?? 0) / c.pageSize),
};

export class InfiniteQuery<I, O> {
  private readonly $state = observable<InfiniteQueryState<O>>({ ...(INITIAL as InfiniteQueryState<O>) });
  private cursor: unknown = undefined;
  private pageNumber = 0;

  constructor(
    private readonly endpoint: EndpointNode<I, O>,
    private readonly cache: QueryCache,
    private readonly opts: InfiniteQueryOptions<I>,
  ) {
    if (opts.enabled !== false) void this.fetchNext();
  }

  get state(): Observable<InfiniteQueryState<O>> {
    return this.$state;
  }

  async refetch(): Promise<void> {
    this.pageNumber = 0;
    this.cursor = undefined;
    this.$state.set({ ...(INITIAL as InfiniteQueryState<O>) });
    await this.fetchNext();
  }

  async fetchNext(): Promise<void> {
    const current = this.$state.get();
    const isInitial = this.pageNumber === 0;
    if (!isInitial && (!current.hasMore || current.isFetchingMore)) return;

    this.$state.set({
      ...current,
      status: isInitial ? "pending" : current.status,
      isFetchingMore: !isInitial,
      error: undefined,
    });

    try {
      const { items, raw } = await this.fetchPage(this.nextPageParam());
      this.pageNumber += 1;
      if (this.opts.pagination.type === "cursor") {
        this.cursor = (raw as Raw)?.[this.opts.pagination.cursorField];
      }
      const prev = this.$state.get();
      const pages = [...prev.pages, items];
      this.$state.set({
        pages,
        flat: pages.flat(),
        status: "success",
        error: undefined,
        isFetchingMore: false,
        hasMore: hasMoreFor(this.opts.pagination, items, raw as Raw, this.pageNumber),
      });
    } catch (error) {
      const prev = this.$state.get();
      this.$state.set({
        ...prev,
        error: toError(error),
        status: isInitial ? "error" : prev.status,
        isFetchingMore: false,
      });
    }
  }

  dispose(): void {
    // pages live in the cache and GC on their own timers
  }

  private nextPageParam(): unknown {
    return this.opts.pagination.type === "cursor" ? this.cursor : this.pageNumber + 1;
  }

  private async fetchPage(pageOrCursor: unknown): Promise<{ items: O[]; raw: unknown }> {
    const input = this.buildPageInput(pageOrCursor);
    const key = queryKeyOf(this.endpoint.path, input);

    const entry = this.cache.getOrCreate<unknown>(
      key,
      () => this.endpoint.call(input as I),
      { tags: this.endpoint.def.tags, staleTime: this.endpoint.def.staleTime },
    );

    if (entry.inflight) await entry.inflight;
    const final = entry.state.get();
    if (final.error) throw final.error;
    return { items: extractItems<O>(final.data), raw: final.data };
  }

  private buildPageInput(pageOrCursor: unknown): Record<string, unknown> {
    const base = (this.opts.input as Record<string, unknown>) ?? {};
    const query = { ...((base.query as Record<string, unknown>) ?? {}) };
    const p = this.opts.pagination;

    if (p.type === "cursor") {
      if (pageOrCursor !== undefined) query[p.cursorParam ?? "cursor"] = pageOrCursor;
    } else {
      query[p.pageParam ?? "page"] = pageOrCursor;
    }
    return { ...base, query };
  }
}

function hasMoreFor(p: Pagination, items: unknown[], raw: Raw, page: number): boolean {
  return (HAS_MORE[p.type] as (items: unknown[], raw: Raw, page: number, cfg: Pagination) => boolean)(items, raw, page, p);
}

function extractItems<O>(raw: unknown): O[] {
  if (Array.isArray(raw)) return raw as O[];
  const data = (raw as Record<string, unknown>)?.data;
  if (Array.isArray(data)) return data as O[];
  return [raw as O];
}

export function createInfiniteQuery<I, O>(
  endpoint: EndpointNode<I, O>,
  cache: QueryCache,
  opts: InfiniteQueryOptions<I>,
): InfiniteQuery<I, O> {
  return new InfiniteQuery(endpoint, cache, opts);
}
