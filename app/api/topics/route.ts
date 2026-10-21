import { NextResponse, type NextRequest } from "next/server";
import { isLocalRequest } from "@/lib/auth/local";
import { getConfig } from "@/lib/config";
import { apiKeyFromHeaders, authenticateApiKey } from "@/lib/data/api-keys";
import { parsePaging, parseTopicFilters } from "@/lib/data/topic-filters";
import { listTopics, type TopicListRow } from "@/lib/data/topics";
import { getDb } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { clientIp, RateLimiter } from "@/lib/util/rate-limit";
import { TtlCache } from "@/lib/util/ttl-cache";

/*
 * Search API for the pool:  GET /api/topics?<same filters as the Pool page>&limit=&offset=
 * Needs an API key (created on the dashboard's Keys page) in `Authorization: Bearer <key>` or
 * `X-API-Key: <key>`, except for requests on the server itself (localhost, see lib/auth/local.ts).
 *
 * The URL stores the *filters*, not the results: calling the same URL later returns whatever
 * matches now (time windows like `window=24h` are relative to the moment of the call).
 *
 * Protection (per web process): identical requests are served from a short cache, each client IP
 * gets a token-bucket rate limit, and results are capped at 500 per request.
 */
export const dynamic = "force-dynamic";

type ApiTopic = {
  id: number;
  title: string;
  url: string | null;
  score: number;
  category: string | null;
  tags: string[];
  lang: string | null;
  status: string;
  sources: { key: string; name: string }[];
  sourceCount: number;
  itemCount: number;
  publishedAt: string;
  firstSeenAt: string;
  lastSeenAt: string;
  summary: string | null;
};

const toApi = (t: TopicListRow): ApiTopic => ({
  id: t.id,
  title: t.title,
  url: t.canonicalUrl,
  score: t.score,
  category: t.category,
  tags: t.tags,
  lang: t.lang,
  status: t.status,
  sources: t.sources,
  sourceCount: t.sourceCount,
  itemCount: t.itemCount,
  publishedAt: t.publishedAt.toISOString(),
  firstSeenAt: t.firstSeenAt.toISOString(),
  lastSeenAt: t.lastSeenAt.toISOString(),
  summary: t.llmSummary,
});

// Module-level = shared by all requests in this process.
const cfg = (() => {
  try {
    return getConfig();
  } catch {
    return undefined; // build time: env not available
  }
})();
const cacheSeconds = cfg?.API_CACHE_SECONDS ?? 60;
const perMinute = cfg?.API_RATE_LIMIT_PER_MIN ?? 60;
const localBypass = cfg?.AUTH_LOCALHOST_BYPASS ?? false;
const cache = new TtlCache<string>(cacheSeconds * 1000, 1000);
// Burst of `perMinute` requests, refilling at perMinute/60 per second.
const limiter = new RateLimiter(perMinute, perMinute / 60);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, X-API-Key, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const rl = limiter.take(clientIp(req.headers));
  const rlHeaders = { "RateLimit-Limit": String(perMinute), "RateLimit-Remaining": String(rl.remaining) };
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Slow down and retry later.", retryAfterSeconds: rl.retryAfterSec },
      { status: 429, headers: { ...CORS, ...rlHeaders, "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  if (!(localBypass && isLocalRequest(req.headers))) {
    const key = apiKeyFromHeaders(req.headers);
    if (!key || !(await authenticateApiKey(getDb(), key))) {
      return NextResponse.json(
        {
          error: key
            ? "Invalid or revoked API key."
            : "API key required: send it as 'Authorization: Bearer <key>' or 'X-API-Key: <key>'.",
        },
        { status: 401, headers: { ...CORS, ...rlHeaders, "WWW-Authenticate": "Bearer" } },
      );
    }
  }

  const params = req.nextUrl.searchParams;
  const filters = parseTopicFilters(params);
  const paging = parsePaging(params);
  // Normalized cache key: same filters in any order / with defaults spelled out = same entry.
  const key = JSON.stringify({ ...filters, ...paging });

  try {
    const { value: body, hit } = await cache.getOrCompute(key, async () =>
      JSON.stringify((await listTopics(getDb(), { ...filters, ...paging })).map(toApi)),
    );
    return new NextResponse(body, {
      status: 200,
      headers: {
        ...CORS,
        ...rlHeaders,
        "Content-Type": "application/json; charset=utf-8",
        // `private`: the client may cache, but a shared cache/CDN must not serve it to callers without a key.
        "Cache-Control": `private, max-age=${cacheSeconds}`,
        Vary: "Authorization, X-API-Key",
        "X-Cache": hit ? "HIT" : "MISS",
      },
    });
  } catch (err) {
    logger.error({ err }, "api/topics failed");
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: CORS });
  }
}
