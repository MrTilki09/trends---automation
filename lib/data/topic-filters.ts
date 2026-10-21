import type { TopicStatus } from "../db/schema";
import {
  DEFAULT_DIR,
  FOCUSES,
  SORTS,
  TIME_WINDOWS,
  TOPIC_STATUSES,
  type Focus,
  type SortDir,
  type SortKey,
  type TimeWindow,
  type TopicFilters,
} from "./topics";

/*
 * One place that turns URL query parameters into TopicFilters (and back).
 * Both the Pool page and the public API (/api/topics) use it, so an API URL copied from the
 * Pool always returns exactly what the Pool shows.
 */

/** Query parameter order in generated URLs (stable URLs = better caching). */
const KEYS = ["focus", "status", "window", "sort", "dir", "category", "tag", "lang", "source", "q"] as const;

export const API_MAX_LIMIT = 500;
export const API_DEFAULT_LIMIT = 200;

type Getter = (key: string) => string | null | undefined;

/** Reads filters from URLSearchParams, Next.js searchParams or any key → value getter. Invalid values fall back to defaults. */
export function parseTopicFilters(
  input: URLSearchParams | Record<string, string | string[] | undefined>,
): TopicFilters {
  const get: Getter =
    input instanceof URLSearchParams
      ? (k) => input.get(k)
      : (k) => {
          const v = input[k];
          return Array.isArray(v) ? v[0] : v;
        };
  const str = (k: string) => {
    const v = get(k)?.trim();
    return v ? v.slice(0, 200) : undefined;
  };

  const status = str("status") ?? "new";
  const window = str("window") ?? "72h";
  // "newest" (old links) = published, newest first.
  const rawSort = str("sort") === "newest" ? "published" : (str("sort") ?? "score");
  const sort = (rawSort in SORTS ? rawSort : "score") as SortKey;
  const rawDir = str("dir");
  const focus = str("focus") ?? "tech";

  return {
    focus: (focus in FOCUSES ? focus : "tech") as Focus,
    status:
      status === "all" || TOPIC_STATUSES.includes(status as TopicStatus)
        ? (status as TopicStatus | "all")
        : "new",
    window: (window in TIME_WINDOWS ? window : "72h") as TimeWindow,
    sort,
    dir: (rawDir === "asc" || rawDir === "desc" ? rawDir : DEFAULT_DIR[sort]) as SortDir,
    source: str("source"),
    category: str("category"),
    tag: str("tag"),
    lang: str("lang"),
    q: str("q"),
  };
}

/** Paging for the API: ?limit= (1–500, default 200) and ?offset=. */
export function parsePaging(params: URLSearchParams): { limit: number; offset: number } {
  const n = (v: string | null, def: number) => {
    const x = Number.parseInt(v ?? "", 10);
    return Number.isFinite(x) ? x : def;
  };
  return {
    limit: Math.min(API_MAX_LIMIT, Math.max(1, n(params.get("limit"), API_DEFAULT_LIMIT))),
    offset: Math.min(100_000, Math.max(0, n(params.get("offset"), 0))),
  };
}

/** Query string for `filters` with `change` applied (undefined removes a key). Always lists every set filter. */
export function filtersToQuery(
  filters: TopicFilters,
  change: Partial<Record<keyof TopicFilters, string | undefined>> = {},
): string {
  const merged = { ...filters, ...change };
  const params = new URLSearchParams();
  for (const key of KEYS) {
    const v = merged[key];
    if (v != null && v !== "") params.set(key, String(v));
  }
  return params.toString();
}
