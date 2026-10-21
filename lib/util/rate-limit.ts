/**
 * Token-bucket rate limiter keyed by client (IP). Each client gets `capacity` requests that refill
 * at `refillPerSec`. In memory and per process — it stops one client from hammering the API, but it
 * is NOT DDoS protection (see README: put Cloudflare or similar in front for that).
 */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; updated: number }>();

  constructor(
    private capacity: number,
    private refillPerSec: number,
    private maxClients = 10_000,
    private now: () => number = Date.now,
  ) {}

  /** Consumes one token. `retryAfterSec` tells the client when to try again when not allowed. */
  take(key: string): { allowed: boolean; remaining: number; retryAfterSec: number } {
    const t = this.now();
    let b = this.buckets.get(key);
    if (!b) {
      if (this.buckets.size >= this.maxClients) this.evictIdle(t);
      b = { tokens: this.capacity, updated: t };
      this.buckets.set(key, b);
    } else {
      b.tokens = Math.min(this.capacity, b.tokens + ((t - b.updated) / 1000) * this.refillPerSec);
      b.updated = t;
    }
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return { allowed: true, remaining: Math.floor(b.tokens), retryAfterSec: 0 };
    }
    return { allowed: false, remaining: 0, retryAfterSec: Math.ceil((1 - b.tokens) / this.refillPerSec) };
  }

  /** Drops clients whose bucket is full again (they're idle) so memory stays bounded. */
  private evictIdle(t: number) {
    for (const [k, b] of this.buckets) {
      if (b.tokens + ((t - b.updated) / 1000) * this.refillPerSec >= this.capacity) this.buckets.delete(k);
    }
    // Still full (an attack from many IPs): drop the oldest half.
    if (this.buckets.size >= this.maxClients) {
      let n = Math.floor(this.buckets.size / 2);
      for (const k of this.buckets.keys()) {
        if (n-- <= 0) break;
        this.buckets.delete(k);
      }
    }
  }
}

/** Best-effort client IP behind a proxy (Caddy/Cloudflare set these headers). */
export function clientIp(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "unknown"
  );
}
