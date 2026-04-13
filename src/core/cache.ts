import type { CacheConfig, QueryState } from "./types";
import { observable, type WritableObservable } from "./observable";
import { toError } from "./errors";

const DEFAULTS: CacheConfig = { staleTime: 0, gcTime: 5 * 60 * 1000, refetchOnFocus: false };

export interface CacheEntry<T = unknown> {
  readonly key: string;
  readonly state: WritableObservable<QueryState<T>>;
  readonly tags: ReadonlySet<string>;
  readonly staleTime: number;
  fetchedAt: number;
  subscribers: number;
  fetch(): Promise<void>;
}

/**
 * Reactive cache keyed by stable query keys. Stores raw data — `select` is
 * never applied here; it's a per-subscription concern handled by Query.
 */
export class QueryCache {
  private entries = new Map<string, CacheEntry>();
  private tagIndex = new Map<string, Set<string>>();
  private gcTimers = new Map<string, ReturnType<typeof setTimeout>>();
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
    key: string,
    fetchFn: () => Promise<T>,
    meta: { tags?: string[]; staleTime?: number },
  ): CacheEntry<T> {
    const existing = this.entries.get(key);
    if (existing) {
      this.cancelGc(key);
      return existing as CacheEntry<T>;
    }

    const state = observable<QueryState<T>>({
      data: undefined,
      error: undefined,
      status: "idle",
      isFetching: false,
    });

    const tags = new Set(meta.tags ?? []);

    const doFetch = async () => {
      const current = state.get();
      state.set({
        ...current,
        isFetching: true,
        status: current.data === undefined ? "pending" : current.status,
      });
      try {
        const data = await fetchFn();
        state.set({ data, error: undefined, status: "success", isFetching: false });
        entry.fetchedAt = Date.now();
      } catch (error) {
        state.set({ ...state.get(), error: toError(error), status: "error", isFetching: false });
      }
    };

    const entry: CacheEntry<T> = {
      key,
      state,
      tags,
      staleTime: meta.staleTime ?? this.config.staleTime,
      fetchedAt: 0,
      subscribers: 0,
      fetch: doFetch,
    };

    this.entries.set(key, entry);
    this.indexTags(key, tags);
    doFetch();

    return entry;
  }

  get<T>(key: string): CacheEntry<T> | undefined {
    return this.entries.get(key) as CacheEntry<T> | undefined;
  }

  subscribe(key: string): () => void {
    const entry = this.entries.get(key);
    if (!entry) return () => {};

    entry.subscribers++;
    this.cancelGc(key);

    return () => {
      entry.subscribers--;
      if (entry.subscribers <= 0) {
        entry.subscribers = 0;
        this.scheduleGc(key);
      }
    };
  }

  ensureFresh(key: string): void {
    const entry = this.entries.get(key);
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

  invalidateByKey(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.fetchedAt = 0;
    if (entry.subscribers > 0) entry.fetch();
  }

  private isStale(entry: CacheEntry): boolean {
    return entry.fetchedAt === 0 || Date.now() - entry.fetchedAt >= entry.staleTime;
  }

  private indexTags(key: string, tags: ReadonlySet<string>): void {
    for (const tag of tags) {
      let set = this.tagIndex.get(tag);
      if (!set) {
        set = new Set();
        this.tagIndex.set(tag, set);
      }
      set.add(key);
    }
  }

  private refetchStale(): void {
    for (const [, entry] of this.entries) {
      if (entry.subscribers > 0 && this.isStale(entry)) entry.fetch();
    }
  }

  private scheduleGc(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;

    const timer = setTimeout(() => {
      if (entry.subscribers > 0) return;
      this.removeTags(key, entry.tags);
      this.entries.delete(key);
      this.gcTimers.delete(key);
    }, this.config.gcTime);

    this.gcTimers.set(key, timer);
  }

  private cancelGc(key: string): void {
    const timer = this.gcTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.gcTimers.delete(key);
    }
  }

  private removeTags(key: string, tags: ReadonlySet<string>): void {
    for (const tag of tags) {
      const set = this.tagIndex.get(tag);
      if (!set) continue;
      set.delete(key);
      if (set.size === 0) this.tagIndex.delete(tag);
    }
  }
}
