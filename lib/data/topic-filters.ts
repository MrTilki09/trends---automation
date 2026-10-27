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

/**
 * What signed-out visitors see: every status except topics the owner marked "ignored" (the status
 * filter is the owner's curation tool and isn't offered to them).
 */
export function publicView(f: TopicFilters): TopicFilters {
  return { ...f, status: "all", hideIgnored: true };
}

/** Rows per page offered on the Pool page; the first is the default. */
export const PAGE_SIZES = [50, 25, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
/** Most rows one export may contain. */
export const EXPORT_MAX_ROWS = 5000;

/** Pool page paging: ?page= (1-based) and ?per= (one of PAGE_SIZES). Invalid values fall back to defaults. */
export function parsePage(input: URLSearchParams | Record<string, string | string[] | undefined>): {
  page: number;
  per: PageSize;
} {
  const get = (k: string) => {
    const v = input instanceof URLSearchParams ? input.get(k) : input[k];
    return Array.isArray(v) ? v[0] : (v ?? undefined);
  };
  const page = Number.parseInt(get("page") ?? "", 10);
  const per = Number.parseInt(get("per") ?? "", 10);
  return {
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 10_000) : 1,
    per: (PAGE_SIZES as readonly number[]).includes(per) ? (per as PageSize) : PAGE_SIZES[0],
  };
}

/** Page numbers to show around `current` (1 … 4 5 [6] 7 8 … 20); null = a gap. */
export function pageWindow(current: number, total: number, around = 2): (number | null)[] {
  const pages = new Set([1, total]);
  for (let p = current - around; p <= current + around; p++) if (p >= 1 && p <= total) pages.add(p);
  const sorted = [...pages].filter((p) => p >= 1).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  for (const p of sorted) {
    const prev = out[out.length - 1];
    if (typeof prev === "number" && p - prev > 1) out.push(p - prev === 2 ? p - 1 : null);
    out.push(p);
  }
  return out;
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
