import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "../config";
import { logger } from "../logger";
import { clientIp, RateLimiter } from "../util/rate-limit";
import { TtlCache } from "../util/ttl-cache";
import type { z } from "zod";
import type { User } from "../db/schema";
import { getDb } from "../db/client";
import { sentAuth, userFromRequest } from "./auth";

/*
 * Shared plumbing for /api/app/v1/*: CORS, a per-IP rate limit, and a short shared cache for
 * anonymous GETs (the data only changes once an hour, so 60 s keeps Postgres nearly idle).
 */

const cfg = (() => {
  try {
    return getConfig();
  } catch {
    return undefined; // build time: env not available
  }
})();
const cacheSeconds = cfg?.API_CACHE_SECONDS ?? 60;
// The app makes more calls than a data client (scrolling, story pages): a larger budget per IP.
const perMinute = Math.max(120, (cfg?.API_RATE_LIMIT_PER_MIN ?? 60) * 2);
const limiter = new RateLimiter(perMinute, perMinute / 60);
const cache = new TtlCache<string>(cacheSeconds * 1000, 2000);

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function preflight() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export function jsonError(status: number, error: string, headers: Record<string, string> = {}) {
  return NextResponse.json({ error }, { status, headers: { ...CORS, ...headers } });
}

/** Rate limit by client IP; returns a 429 response when over the limit, else null. */
export function rateLimited(req: NextRequest): NextResponse | null {
  const rl = limiter.take(clientIp(req.headers));
  if (rl.allowed) return null;
  return jsonError(429, "Too many requests. Slow down and retry later.", {
    "Retry-After": String(rl.retryAfterSec),
  });
}

/**
 * An anonymous, cacheable GET: rate limit, then serve `compute()` from the shared cache keyed by
 * `key` (path + normalized query). `compute` returning null = 404.
 */
export async function cachedGet(
  req: NextRequest,
  key: string,
  compute: () => Promise<unknown | null>,
): Promise<NextResponse> {
  const limited = rateLimited(req);
  if (limited) return limited;
  try {
    const { value, hit } = await cache.getOrCompute(key, async () => {
      const body = await compute();
      return body == null ? "" : JSON.stringify(body);
    });
    if (!value) return jsonError(404, "Not found");
    return new NextResponse(value, {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=${cacheSeconds}`,
        "X-Cache": hit ? "HIT" : "MISS",
      },
    });
  } catch (err) {
    logger.error({ err, key }, "app api failed");
    return jsonError(500, "Internal error");
  }
}

/** Reads a short, trimmed query value (undefined when empty). */
export function param(req: NextRequest, name: string, max = 100): string | undefined {
  const v = req.nextUrl.searchParams.get(name)?.trim();
  return v ? v.slice(0, max) : undefined;
}

// ---------------------------------------------------------------- signed-in requests


/** JSON response for personal data: never cached by shared caches. */
export function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { ...CORS, "Cache-Control": "private, no-store" },
  });
}

/**
 * Resolves the caller. required: anonymous → 401. Optional: anonymous → null user, but a bad or
 * expired token still answers 401 so the app refreshes it instead of silently showing logged-out data.
 */
export async function caller(
  req: NextRequest,
  required: boolean,
): Promise<{ user: User | null; error?: never } | { user?: never; error: NextResponse }> {
  const limited = rateLimited(req);
  if (limited) return { error: limited };
  const user = await userFromRequest(getDb(), req.headers, cfg?.SESSION_SECRET);
  if (!user && (required || sentAuth(req.headers))) {
    return {
      error: jsonError(401, sentAuth(req.headers) ? "Session expired. Sign in again." : "Sign in first.", {
        "WWW-Authenticate": "Bearer",
      }),
    };
  }
  return { user };
}

/** Writes need an account that isn't banned. */
export function bannedError(user: User): NextResponse | null {
  return user.bannedAt ? jsonError(403, "This account can't post or react.") : null;
}

/** Parses a JSON body with a zod schema; returns a 400 response on bad input. */
export async function readJson<S extends z.ZodType>(
  req: NextRequest,
  schema: S,
): Promise<{ data: z.infer<S>; error?: never } | { data?: never; error: NextResponse }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { error: jsonError(400, "Send a JSON body.") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: jsonError(400, first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid body.") };
  }
  return { data: parsed.data };
}

export const sessionSecret = () => cfg?.SESSION_SECRET;
