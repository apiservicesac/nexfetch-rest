import type { Observable } from "./observable";
import { observable } from "./observable";
import type { EndpointNode } from "./endpoint";
import type { QueryCache } from "./cache";
import type { InfiniteQueryOptions, InfiniteQueryState, PaginationConfig } from "./types";
import { queryKeyOf } from "./key";
import { toError } from "./errors";

/**
 * Framework-agnostic paginated query. Each page is stored as its own cache
 * entry with the endpoint's tags, so tag invalidation reaches paginated data.
 */
export class InfiniteQuery<I, O> {
  private readonly $state = observable<InfiniteQueryState<O>>({
    pages: [],
    flat: [],
    status: "idle",
    error: undefined,
    isFetchingMore: false,
    hasMore: true,
  });

  private cursor: unknown = undefined;
  private pageNumber = 0;
  private readonly pagination: PaginationConfig;
  private readonly baseInput: Record<string, unknown>;

  constructor(
    private readonly endpoint: EndpointNode<I, O>,
    private readonly cache: QueryCache,
    private readonly opts: InfiniteQueryOptions<I>,
  ) {
    this.pagination = opts.pagination;
    this.baseInput = (opts.input as Record<string, unknown>) ?? {};

    if (opts.enabled !== false) {
      void this.loadInitial();
    }
  }

  get state(): Observable<InfiniteQueryState<O>> {
    return this.$state;
  }

  async refetch(): Promise<void> {
    this.pageNumber = 0;
    this.cursor = undefined;
    this.$state.set({
      pages: [],
      flat: [],
      status: "pending",
      error: undefined,
      isFetchingMore: false,
      hasMore: true,
    });
    await this.loadInitial();
  }

  async fetchNext(): Promise<void> {
    const current = this.$state.get();
    if (!current.hasMore || current.isFetchingMore) return;

    this.$state.set({ ...current, isFetchingMore: true });

    try {
      const { items, raw } = await this.fetchPage(
        this.pagination.type === "cursor" ? this.cursor : this.pageNumber + 1,
      );
      this.pageNumber += 1;
      if (this.pagination.type === "cursor") {
        this.cursor = (raw as Record<string, unknown>)?.[this.pagination.cursorField];
      }

      const next = this.$state.get();
      const pages = [...next.pages, items];
      this.$state.set({
        ...next,
        pages,
        flat: pages.flat(),
        hasMore: this.resolveHasMore(items, raw, this.pageNumber),
        isFetchingMore: false,
      });
    } catch (error) {
      this.$state.set({ ...this.$state.get(), error: toError(error), isFetchingMore: false });
    }
  }

  dispose(): void {
    // pages are just cache entries; they GC on their own timers
  }

  private async loadInitial(): Promise<void> {
    this.$state.set({ ...this.$state.get(), status: "pending", error: undefined });
    try {
      const initial = this.pagination.type === "cursor" ? undefined : 1;
      const { items, raw } = await this.fetchPage(initial);
      this.pageNumber = 1;
      if (this.pagination.type === "cursor") {
        this.cursor = (raw as Record<string, unknown>)?.[this.pagination.cursorField];
      }
      this.$state.set({
        pages: [items],
        flat: items,
        status: "success",
        error: undefined,
        isFetchingMore: false,
        hasMore: this.resolveHasMore(items, raw, 1),
      });
    } catch (error) {
      this.$state.set({ ...this.$state.get(), error: toError(error), status: "error" });
    }
  }

  private async fetchPage(pageOrCursor: unknown): Promise<{ items: O[]; raw: unknown }> {
    const input = this.buildPageInput(pageOrCursor);
    const key = queryKeyOf(this.endpoint.path, input);

    const entry = this.cache.getOrCreate<unknown>(
      key,
      () => this.endpoint.call(input as I),
      { tags: this.endpoint.def.tags, staleTime: this.endpoint.def.staleTime },
    );

    // Wait for the entry to have data (success or error)
    await waitFor(entry);
    const finalState = entry.state.get();
    if (finalState.error) throw finalState.error;
    const raw = finalState.data;
    const items = extractItems<O>(raw);
    return { items, raw };
  }

  private buildPageInput(pageOrCursor: unknown): Record<string, unknown> {
    const input: Record<string, unknown> = { ...this.baseInput };
    const query: Record<string, unknown> = { ...(input.query as Record<string, unknown> ?? {}) };

    if (this.pagination.type === "offset" || this.pagination.type === "total") {
      query[this.pagination.pageParam ?? "page"] = pageOrCursor;
    } else if (this.pagination.type === "cursor" && pageOrCursor !== undefined) {
      query[this.pagination.cursorParam ?? "cursor"] = pageOrCursor;
    }
    input.query = query;
    return input;
  }

  private resolveHasMore(items: O[], raw: unknown, currentPage: number): boolean {
    if (this.pagination.type === "offset") {
      return items.length >= this.pagination.pageSize;
    }
    if (this.pagination.type === "cursor") {
      return (raw as Record<string, unknown>)?.[this.pagination.cursorField] != null;
    }
    if (this.pagination.type === "total") {
      const total = ((raw as Record<string, unknown>)?.[this.pagination.totalField] as number) ?? 0;
      return currentPage < Math.ceil(total / this.pagination.pageSize);
    }
    return false;
  }
}

function extractItems<O>(raw: unknown): O[] {
  if (Array.isArray(raw)) return raw as O[];
  const data = (raw as Record<string, unknown>)?.data;
  if (Array.isArray(data)) return data as O[];
  return [raw as O];
}

function waitFor(entry: { state: Observable<{ status: string }> }): Promise<void> {
  return new Promise((resolve) => {
    const s = entry.state.get();
    if (s.status === "success" || s.status === "error") return resolve();
    const unsub = entry.state.subscribe((next) => {
      if (next.status === "success" || next.status === "error") {
        unsub();
        resolve();
      }
    });
  });
}

export function createInfiniteQuery<I, O>(
  endpoint: EndpointNode<I, O>,
  cache: QueryCache,
  opts: InfiniteQueryOptions<I>,
): InfiniteQuery<I, O> {
  return new InfiniteQuery(endpoint, cache, opts);
}
