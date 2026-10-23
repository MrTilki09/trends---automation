/**
 * Runs `fn` at most once per key within `ttlMs`, and hands the same result to every caller.
 *
 * Used as an idempotency guard for slow, non-repeatable actions such as post generation: browsers,
 * extensions and proxies (e.g. a Cloudflare Tunnel) can re-send a slow POST, and each copy would
 * otherwise do the work again. A copy that arrives while the first is still running waits for it;
 * one that arrives later gets the remembered result. Failures are not remembered, so they can be retried.
 *
 * In-memory, per process: enough for the single web container. The map lives on globalThis so
 * `next dev` module reloads don't empty it.
 */
type Entry<T> = { promise: Promise<T>; expiresAt: number };

export function createOnce<T>(ttlMs: number, now: () => number = Date.now) {
  const entries = new Map<string, Entry<T>>();

  function prune() {
    const t = now();
    for (const [key, e] of entries) if (e.expiresAt <= t) entries.delete(key);
  }

  return {
    /** `replayed` is true when this call reused an earlier (or still running) call's result. */
    async run(key: string, fn: () => Promise<T>): Promise<{ value: T; replayed: boolean }> {
      prune();
      const existing = entries.get(key);
      if (existing) return { value: await existing.promise, replayed: true };
      const promise = fn();
      entries.set(key, { promise, expiresAt: now() + ttlMs });
      try {
        return { value: await promise, replayed: false };
      } catch (err) {
        entries.delete(key);
        throw err;
      }
    },
    size: () => entries.size,
  };
}

const registry = globalThis as unknown as { __onceRegistry?: Map<string, ReturnType<typeof createOnce>> };

/** A named, process-wide `createOnce` instance (survives dev hot reloads). */
export function sharedOnce<T>(name: string, ttlMs: number) {
  registry.__onceRegistry ??= new Map();
  let inst = registry.__onceRegistry.get(name);
  if (!inst) {
    inst = createOnce<unknown>(ttlMs);
    registry.__onceRegistry.set(name, inst);
  }
  return inst as ReturnType<typeof createOnce<T>>;
}
