/**
 * Tiny in-memory cache with a time-to-live and a size cap (oldest entries evicted first).
 * Used by the public API so repeated identical requests don't hit Postgres.
 * Per process: fine for one web container; use Redis/a CDN if you ever run several.
 */
export class TtlCache<V> {
  private map = new Map<string, { value: V; expires: number }>();
  /** Requests waiting on the same key share one computation (no thundering herd). */
  private inflight = new Map<string, Promise<V>>();

  constructor(
    private ttlMs: number,
    private maxEntries = 500,
    private now: () => number = Date.now,
  ) {}

  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: V): void {
    this.map.delete(key);
    this.map.set(key, { value, expires: this.now() + this.ttlMs });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  /** Returns the cached value, or computes it once (concurrent callers share the same promise). */
  async getOrCompute(key: string, compute: () => Promise<V>): Promise<{ value: V; hit: boolean }> {
    const cached = this.get(key);
    if (cached !== undefined) return { value: cached, hit: true };
    let p = this.inflight.get(key);
    if (!p) {
      p = compute()
        .then((v) => {
          this.set(key, v);
          return v;
        })
        .finally(() => this.inflight.delete(key));
      this.inflight.set(key, p);
    }
    return { value: await p, hit: false };
  }

  get size(): number {
    return this.map.size;
  }
}
