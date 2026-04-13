import { atom } from "nanostores";
import type { CacheConfig, QueryEntry, QueryState } from "./types";
import { toError } from "./utils";

const DEFAULTS: CacheConfig = { staleTime: 0, gcTime: 5 * 60 * 1000, refetchOnFocus: false };

export class QueryCache {
  private entries = new Map<string, QueryEntry>();
  private tagIndex = new Map<string, Set<string>>();
  private config: CacheConfig;

  constructor(config?: Partial<CacheConfig>) {
    this.config = { ...DEFAULTS, ...config };

    if (this.config.refetchOnFocus && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") this.refetchStale();
      });
    }
  }

  getOrCreate<T>(
    queryKey: string,
    fetchFn: () => Promise<unknown>,
    opts: {
      staleTime?: number;
      tags?: string[];
      transform?: (raw: unknown) => unknown;
      select?: (data: unknown) => unknown;
    },
  ): QueryEntry<T> {
    const existing = this.entries.get(queryKey);
    if (existing) {
      this.cancelGc(queryKey);
      return existing as QueryEntry<T>;
    }

    const $state = atom<QueryState<T>>({ data: null, isPending: true, error: null, isFetching: true });

    const doFetch = async () => {
      const current = $state.get();
      $state.set({ ...current, isFetching: true, error: null, isPending: current.data === null });

      try {
        let data = await fetchFn();
        if (opts.transform) data = opts.transform(data);
        if (opts.select) data = opts.select(data);
        $state.set({ data: data as T, isPending: false, error: null, isFetching: false });
        entry.fetchedAt = Date.now();
      } catch (error) {
        $state.set({ ...current, isPending: false, isFetching: false, error: toError(error) });
      }
    };

    const tags = opts.tags ?? [];
    const entry: QueryEntry<T> = {
      $state,
      queryKey,
      tags,
      fetchedAt: 0,
      subscribers: 0,
      staleTime: opts.staleTime ?? this.config.staleTime,
      fetch: doFetch,
      gcTimer: null,
    };

    this.entries.set(queryKey, entry);
    this.indexTags(queryKey, tags);
    doFetch();

    return entry;
  }

  ensureFresh(queryKey: string): void {
    const entry = this.entries.get(queryKey);
    if (!entry || !this.isStale(entry)) return;
    entry.fetch();
  }

  invalidateByTag(tag: string): void {
    const keys = this.tagIndex.get(tag);
    if (!keys) return;

    for (const key of keys) {
      const entry = this.entries.get(key);
      if (!entry) continue;
      entry.fetchedAt = 0;
      if (entry.subscribers > 0) entry.fetch();
    }
  }

  subscribe(queryKey: string): () => void {
    const entry = this.entries.get(queryKey);
    if (!entry) return () => {};

    entry.subscribers++;
    this.cancelGc(queryKey);

    return () => {
      entry.subscribers--;
      if (entry.subscribers <= 0) {
        entry.subscribers = 0;
        this.scheduleGc(queryKey);
      }
    };
  }

  private isStale(entry: QueryEntry): boolean {
    return entry.fetchedAt === 0 || Date.now() - entry.fetchedAt >= entry.staleTime;
  }

  private indexTags(queryKey: string, tags: string[]): void {
    for (const tag of tags) {
      let set = this.tagIndex.get(tag);
      if (!set) {
        set = new Set();
        this.tagIndex.set(tag, set);
      }
      set.add(queryKey);
    }
  }

  private refetchStale(): void {
    for (const [, entry] of this.entries) {
      if (entry.subscribers > 0 && this.isStale(entry)) {
        entry.fetch();
      }
    }
  }

  private scheduleGc(queryKey: string): void {
    const entry = this.entries.get(queryKey);
    if (!entry) return;

    entry.gcTimer = setTimeout(() => {
      if (entry.subscribers > 0) return;
      this.removeTags(queryKey, entry.tags);
      this.entries.delete(queryKey);
    }, this.config.gcTime);
  }

  private cancelGc(queryKey: string): void {
    const entry = this.entries.get(queryKey);
    if (entry?.gcTimer) {
      clearTimeout(entry.gcTimer);
      entry.gcTimer = null;
    }
  }

  private removeTags(queryKey: string, tags: string[]): void {
    for (const tag of tags) {
      const set = this.tagIndex.get(tag);
      if (!set) continue;
      set.delete(queryKey);
      if (set.size === 0) this.tagIndex.delete(tag);
    }
  }
}
