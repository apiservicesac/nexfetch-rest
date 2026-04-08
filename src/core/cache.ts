import type { CacheConfig, EndpointDef, InferResponse, QueryEntry } from "./types";
import type { Fetcher } from "./fetcher";
import { createQueryEntry } from "./query";

const DEFAULT_CACHE_CONFIG: CacheConfig = {
  staleTime: 0,
  gcTime: 5 * 60 * 1000, // 5 minutes
  refetchOnFocus: false,
};

export class QueryCache {
  private entries = new Map<string, QueryEntry>();
  private config: CacheConfig;

  constructor(config?: Partial<CacheConfig>) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };

    if (this.config.refetchOnFocus && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") this.refetchStale();
      });
    }
  }

  getOrCreate<E extends EndpointDef>(
    queryKey: string,
    fetcher: Fetcher,
    endpoint: E,
    input: unknown,
    staleTime?: number,
  ): QueryEntry<InferResponse<E>> {
    const existing = this.entries.get(queryKey);
    if (existing) {
      this.cancelGc(queryKey);
      return existing as QueryEntry<InferResponse<E>>;
    }

    const entry = createQueryEntry(fetcher, endpoint, queryKey, input, staleTime ?? endpoint.staleTime ?? this.config.staleTime);
    this.entries.set(queryKey, entry);
    return entry;
  }

  ensureFresh(queryKey: string): void {
    const entry = this.entries.get(queryKey);
    if (!entry) return;
    if (entry.fetchedAt === 0) return; // Still loading initial fetch
    if (Date.now() - entry.fetchedAt < entry.staleTime) return; // Still fresh
    entry.fetch();
  }

  invalidate(keyOrPrefix: string): void {
    for (const [key, entry] of this.entries) {
      if (key === keyOrPrefix || key.startsWith(`${keyOrPrefix}.`) || key.startsWith(`${keyOrPrefix}:`)) {
        entry.fetchedAt = 0; // Mark as stale
        if (entry.subscribers > 0) entry.fetch(); // Refetch if anyone is listening
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
      if (entry.subscribers <= 0) {
        entry.subscribers = 0;
        this.scheduleGc(queryKey);
      }
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
    entry.gcTimer = setTimeout(() => {
      if (entry.subscribers <= 0) this.entries.delete(queryKey);
    }, this.config.gcTime);
  }

  private cancelGc(queryKey: string): void {
    const entry = this.entries.get(queryKey);
    if (entry?.gcTimer) {
      clearTimeout(entry.gcTimer);
      entry.gcTimer = null;
    }
  }
}
