import { atom } from "nanostores";
import type { CacheConfig, QueryEntry, QueryState } from "./types";

const DEFAULTS: CacheConfig = { staleTime: 0, gcTime: 5 * 60 * 1000, refetchOnFocus: false };

export class QueryCache {
  private entries = new Map<string, QueryEntry>();
  private config: CacheConfig;

  constructor(config?: Partial<CacheConfig>) {
    this.config = { ...DEFAULTS, ...config };
    if (this.config.refetchOnFocus && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") this.refetchStale();
      });
    }
  }

  getOrCreate<T>(queryKey: string, fetchFn: () => Promise<T>, staleTime?: number): QueryEntry<T> {
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
        const data = await fetchFn();
        $state.set({ data, isPending: false, error: null, isFetching: false });
        entry.fetchedAt = Date.now();
      } catch (error) {
        $state.set({ ...current, isPending: false, isFetching: false, error: error instanceof Error ? error : new Error(String(error)) });
      }
    };

    const entry: QueryEntry<T> = { $state, queryKey, fetchedAt: 0, subscribers: 0, staleTime: staleTime ?? this.config.staleTime, fetch: doFetch, gcTimer: null };
    this.entries.set(queryKey, entry);
    doFetch();
    return entry;
  }

  ensureFresh(queryKey: string): void {
    const entry = this.entries.get(queryKey);
    if (!entry || entry.fetchedAt === 0) return;
    if (Date.now() - entry.fetchedAt < entry.staleTime) return;
    entry.fetch();
  }

  invalidate(prefix: string): void {
    for (const [key, entry] of this.entries) {
      if (key === prefix || key.startsWith(`${prefix}.`) || key.startsWith(`${prefix}:`)) {
        entry.fetchedAt = 0;
        if (entry.subscribers > 0) entry.fetch();
      }
    }
  }

  subscribe(queryKey: string): () => void {
    const entry = this.entries.get(queryKey);
    if (!entry) return () => {};
    entry.subscribers++;
    this.cancelGc(queryKey);
    return () => {
      entry.subscribers--;
      if (entry.subscribers <= 0) { entry.subscribers = 0; this.scheduleGc(queryKey); }
    };
  }

  private refetchStale(): void {
    for (const [, entry] of this.entries) {
      if (entry.subscribers > 0 && (entry.fetchedAt === 0 || Date.now() - entry.fetchedAt >= entry.staleTime)) {
        entry.fetch();
      }
    }
  }

  private scheduleGc(queryKey: string): void {
    const entry = this.entries.get(queryKey);
    if (!entry) return;
    entry.gcTimer = setTimeout(() => { if (entry.subscribers <= 0) this.entries.delete(queryKey); }, this.config.gcTime);
  }

  private cancelGc(queryKey: string): void {
    const entry = this.entries.get(queryKey);
    if (entry?.gcTimer) { clearTimeout(entry.gcTimer); entry.gcTimer = null; }
  }
}
