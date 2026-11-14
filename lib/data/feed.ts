import { sql, type SQL } from "drizzle-orm";
import type { FeedPage, FeedTab, FeedTopic, Momentum, TopicDetail } from "../app-api/schemas";
import type { DB } from "../db/client";
import { canonicalTag, COMPANY_NAMES, TECH_CATEGORIES } from "../pipeline/classify";
import { normalizeTitle } from "../pipeline/normalize";
import { TECH_ONLY } from "./topics";

/*
 * Queries behind the app API (/api/app/v1). Everything here is read-only and anonymous-safe:
 * ignored topics are never returned and the feed is always tech-only.
 *
 * Stable infinite scroll: Trending pages are ranked by the scores of ONE collection run (a snapshot
 * in topic_score_history), and the cursor carries that run id. Scores change every hour, but a
 * client scrolling through one feed keeps the same order, so nothing repeats or gets skipped.
 * Latest pages are ranked by publish date, which never changes. Both use keyset (cursor) paging.
 */

export const FEED_PAGE_SIZE = 20;
export const FEED_WINDOW_HOURS = 72;
export const SEARCH_WINDOW_HOURS = 24 * 30;

/** Momentum thresholds: change of score over MOMENTUM_HOURS (scores also decay ~16% per 6 h). */
export const MOMENTUM = { hours: 6, risingAt: 0.1, fadingAt: -0.3, minPast: 0.05 } as const;

export function momentumOf(
  now: number,
  past: number | null,
  ageHours: number,
): { momentum: Momentum; change: number | null } {
  if (past == null) return { momentum: ageHours < MOMENTUM.hours ? "new" : "steady", change: null };
  const change = Math.round(((now - past) / Math.max(past, MOMENTUM.minPast)) * 100) / 100;
  const momentum: Momentum =
    change >= MOMENTUM.risingAt ? "rising" : change <= MOMENTUM.fadingAt ? "fading" : "steady";
  return { momentum, change };
}

// ---------------------------------------------------------------- cursors

/** v = snapshot run id (Trending) or 0; k = sort key (score, or publish time in ms); id = last topic id. */
export type Cursor = { tab: FeedTab | "search"; v: number; k: number; id: number };

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify([c.tab, c.v, c.k, c.id])).toString("base64url");
}

export function decodeCursor(s: string | null | undefined): Cursor | null {
  if (!s || s.length > 200) return null;
  try {
    const arr = JSON.parse(Buffer.from(s, "base64url").toString("utf8")) as unknown;
    if (!Array.isArray(arr) || arr.length !== 4) return null;
    const [tab, v, k, id] = arr as [unknown, unknown, unknown, unknown];
    if (
      typeof tab !== "string" ||
      !["for-you", "trending", "latest", "search"].includes(tab) ||
      ![v, k, id].every((n) => typeof n === "number" && Number.isFinite(n))
    )
      return null;
    return { tab: tab as Cursor["tab"], v: v as number, k: k as number, id: id as number };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- shared SQL

const PUBLISHED = sql.raw("coalesce(t.published_at, t.first_seen_at)");

/** Columns every app topic needs (the list endpoints and the story page). `rank` = the sort key. */
function topicColumns(rank: SQL): SQL {
  return sql`
    t.id, t.title,
    -- Link to the article itself: Google News items only have news.google.com redirect links.
    coalesce((SELECT r.url FROM raw_items r JOIN sources s ON s.id = r.source_id
              WHERE r.topic_id = t.id AND r.url IS NOT NULL AND r.url NOT LIKE 'https://news.google.com/%'
              ORDER BY s.weight DESC, coalesce(r.published_at, r.fetched_at) LIMIT 1),
             t.canonical_url) AS canonical_url,
    t.snippet, t.snippet_publisher, t.image_url,
    coalesce(t.category, t.llm_category) AS category, t.tags, t.lang, ${PUBLISHED} AS published_at,
    t.publisher_count, t.score, ${rank} AS rank,
    (SELECT array_agg(p ORDER BY w DESC, first) FROM (
       SELECT r.publisher AS p, max(s.weight) AS w, min(coalesce(r.published_at, r.fetched_at)) AS first
       FROM raw_items r JOIN sources s ON s.id = r.source_id
       WHERE r.topic_id = t.id AND r.publisher IS NOT NULL GROUP BY r.publisher LIMIT 4) x) AS publishers,
    (SELECT max((r.metrics->>'points')::int) FROM raw_items r
       WHERE r.topic_id = t.id AND r.publisher = 'Hacker News') AS hn_points,
    (SELECT max((r.metrics->>'comments')::int) FROM raw_items r
       WHERE r.topic_id = t.id AND r.publisher = 'Hacker News') AS hn_comments,
    (SELECT h.score FROM topic_score_history h
       WHERE h.topic_id = t.id AND h.created_at <= now() - make_interval(hours => ${MOMENTUM.hours})
       ORDER BY h.created_at DESC LIMIT 1) AS past_score`;
}

type Row = Record<string, unknown>;

function toFeedTopic(r: Row): FeedTopic {
  const published = new Date(r.published_at as string);
  const ageHours = (Date.now() - published.getTime()) / 3600_000;
  const score = Number(r.score);
  const { momentum, change } = momentumOf(
    score,
    r.past_score == null ? null : Number(r.past_score),
    ageHours,
  );
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    id: Number(r.id),
    title: String(r.title),
    url: (r.canonical_url as string | null) ?? null,
    snippet: (r.snippet as string | null) ?? null,
    snippetPublisher: (r.snippet_publisher as string | null) ?? null,
    imageUrl: (r.image_url as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    tags: ((r.tags as string[] | null) ?? []).slice(0, 8),
    lang: (r.lang as string | null) ?? null,
    publishedAt: published.toISOString(),
    publisherCount: Math.max(1, Number(r.publisher_count ?? 0)),
    publishers: (r.publishers as string[] | null) ?? [],
    momentum,
    momentumChange: change,
    hnPoints: num(r.hn_points),
    hnComments: num(r.hn_comments),
    counters: { reactions: 0, comments: 0, saves: 0 },
  };
}

const list = (values: string[]) =>
  sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  );

export type FeedQuery = {
  tab: FeedTab;
  category?: string;
  /** One tag, e.g. "launch" (the app's "Launches" chip) or a company. */
  tag?: string;
  lang?: string;
  cursor?: string | null;
  limit?: number;
};

function feedFilters(q: Pick<FeedQuery, "category" | "tag" | "lang">, windowHours: number): SQL[] {
  const where: SQL[] = [
    TECH_ONLY,
    sql`t.status <> 'ignored'`,
    sql`${PUBLISHED} > now() - make_interval(hours => ${windowHours})`,
  ];
  if (q.category) where.push(sql`coalesce(t.category, t.llm_category) = ${q.category}`);
  if (q.tag) {
    const tags = canonicalTag(q.tag);
    if (tags.length) where.push(sql`t.tags @> ARRAY[${list(tags)}]::text[]`);
  }
  if (q.lang) where.push(sql`t.lang = ${q.lang}`);
  return where;
}

/** The newest collection run that has a score snapshot (null before the first run after upgrading). */
export async function latestFeedVersion(db: DB): Promise<number | null> {
  const res = await db.execute(sql`SELECT max(run_id) AS v FROM topic_score_history`);
  const v = (res.rows[0] as { v: number | null } | undefined)?.v;
  return v == null ? null : Number(v);
}

export async function getFeed(db: DB, q: FeedQuery): Promise<FeedPage> {
  const limit = Math.min(50, Math.max(1, q.limit ?? FEED_PAGE_SIZE));
  // Anonymous "For you" = Trending (personalization arrives with accounts).
  const tab: FeedTab = q.tab;
  const byDate = tab === "latest";
  const cursor = decodeCursor(q.cursor);
  const usable = cursor != null && cursor.tab === tab;
  const latest = await latestFeedVersion(db);
  // Keep the snapshot the client started scrolling with, as long as it still exists.
  const version = usable && cursor.v > 0 ? cursor.v : (latest ?? 0);

  const where = feedFilters(q, FEED_WINDOW_HOURS);
  let from: SQL;
  let rank: SQL;
  if (byDate) {
    from = sql`FROM topics t`;
    rank = sql`extract(epoch FROM ${PUBLISHED}) * 1000`;
    if (usable) where.push(sql`(${PUBLISHED}, t.id) < (to_timestamp(${cursor.k} / 1000.0), ${cursor.id})`);
  } else if (version > 0) {
    from = sql`FROM topics t JOIN topic_score_history snap ON snap.topic_id = t.id AND snap.run_id = ${version}`;
    rank = sql`snap.score`;
    if (usable) where.push(sql`(snap.score, t.id) < (${cursor.k}, ${cursor.id})`);
  } else {
    from = sql`FROM topics t`;
    rank = sql`t.score`;
    if (usable) where.push(sql`(t.score, t.id) < (${cursor.k}, ${cursor.id})`);
  }

  const res = await db.execute(sql`
    SELECT ${topicColumns(rank)}
    ${from}
    WHERE ${sql.join(where, sql` AND `)}
    ORDER BY rank DESC, t.id DESC
    LIMIT ${limit + 1}`);
  const rows = res.rows as Row[];
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(toFeedTopic),
    nextCursor:
      rows.length > limit && last
        ? encodeCursor({ tab, v: byDate ? 0 : version, k: Number(last.rank), id: Number(last.id) })
        : null,
    feedVersion: latest,
  };
}

/** How many feed stories appeared since the client's feedVersion (for the "N new stories" pill). */
export async function countNewStories(
  db: DB,
  q: Pick<FeedQuery, "category" | "tag" | "lang">,
  sinceVersion: number,
): Promise<{ feedVersion: number | null; newStories: number }> {
  const latest = await latestFeedVersion(db);
  if (latest == null || latest <= sinceVersion) return { feedVersion: latest, newStories: 0 };
  const where = feedFilters(q, FEED_WINDOW_HOURS);
  const res = await db.execute(sql`
    SELECT count(*)::int AS n FROM topics t
    WHERE ${sql.join(where, sql` AND `)}
      AND t.first_seen_at > (SELECT started_at FROM fetch_runs WHERE id = ${sinceVersion})`);
  return { feedVersion: latest, newStories: Number((res.rows[0] as { n: number } | undefined)?.n ?? 0) };
}

export async function getTopicDetail(db: DB, id: number): Promise<TopicDetail | null> {
  const res = await db.execute(sql`
    SELECT ${topicColumns(sql`t.score`)} FROM topics t WHERE t.id = ${id} AND t.status <> 'ignored'`);
  const row = res.rows[0] as Row | undefined;
  if (!row) return null;
  const items = await db.execute(sql`
    SELECT r.id, r.title, r.url, coalesce(r.publisher, s.name) AS publisher, r.snippet, r.image_url,
           coalesce(r.published_at, r.fetched_at) AS published_at
    FROM raw_items r JOIN sources s ON s.id = r.source_id
    WHERE r.topic_id = ${id}
    ORDER BY coalesce(r.published_at, r.fetched_at), r.id`);
  const history = await db.execute(sql`
    SELECT created_at, score FROM topic_score_history
    WHERE topic_id = ${id} AND created_at > now() - interval '24 hours'
    ORDER BY created_at`);
  // The same article often arrives through several feeds (HN top + HN best): show it once.
  const seen = new Set<string>();
  const storyItems = (items.rows as Row[])
    .filter((r) => {
      const key = `${String(r.publisher).toLowerCase()}|${normalizeTitle(String(r.title))}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((r) => ({
      id: Number(r.id),
      title: String(r.title),
      url: (r.url as string | null) ?? null,
      publisher: String(r.publisher),
      snippet: (r.snippet as string | null) ?? null,
      imageUrl: (r.image_url as string | null) ?? null,
      publishedAt: new Date(r.published_at as string).toISOString(),
    }));
  return {
    topic: toFeedTopic(row),
    items: storyItems,
    scoreHistory: (history.rows as Row[]).map((h) => ({
      at: new Date(h.created_at as string).toISOString(),
      score: Number(h.score),
    })),
  };
}

/** Tags too generic to be "trending" on Discover. */
const DISCOVER_TAG_STOPLIST = new Set([
  "tech",
  "news",
  "official",
  "dev",
  "technology",
  "teknoloji",
  "haber",
  "turkey",
  "usa",
  "search trend",
  ...TECH_CATEGORIES.map((c) => c.toLowerCase()),
]);

export async function getDiscover(db: DB) {
  const where = sql.join(feedFilters({}, 24), sql` AND `);
  const [categories, tagRows, picks] = await Promise.all([
    db.execute(sql`
      SELECT coalesce(t.category, t.llm_category) AS value, count(*)::int AS count
      FROM topics t WHERE ${where} AND coalesce(t.category, t.llm_category) IS NOT NULL
      GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 12`),
    db.execute(sql`
      SELECT tag AS value, count(*)::int AS count
      FROM topics t CROSS JOIN LATERAL unnest(t.tags) AS tag
      WHERE ${where} GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 120`),
    db.execute(sql`
      SELECT ${topicColumns(sql`t.score`)} FROM topics t
      WHERE t.status = 'shortlisted' AND ${PUBLISHED} > now() - interval '7 days'
      ORDER BY t.score DESC, t.id DESC LIMIT 5`),
  ]);
  const tags = tagRows.rows as { value: string; count: number }[];
  const companies = new Set(COMPANY_NAMES);
  return {
    categories: categories.rows as { value: string; count: number }[],
    companies: tags.filter((t) => companies.has(t.value)).slice(0, 10),
    tags: tags
      .filter((t) => !companies.has(t.value) && !DISCOVER_TAG_STOPLIST.has(t.value) && t.value !== "launch")
      .slice(0, 16),
    editorPicks: (picks.rows as Row[]).map(toFeedTopic),
  };
}

export async function searchTopics(db: DB, q: string, cursorStr?: string | null, limitIn?: number) {
  const limit = Math.min(50, Math.max(1, limitIn ?? FEED_PAGE_SIZE));
  const term = q.trim().slice(0, 100);
  if (!term) return { items: [], nextCursor: null, feedVersion: null };
  const cursor = decodeCursor(cursorStr);
  const where = feedFilters({}, SEARCH_WINDOW_HOURS);
  const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const normLike = `%${normalizeTitle(term)}%`;
  where.push(sql`(t.title ILIKE ${like} OR EXISTS (
    SELECT 1 FROM raw_items r3 WHERE r3.topic_id = t.id AND r3.normalized_title LIKE ${normLike}))`);
  if (cursor?.tab === "search") where.push(sql`(t.score, t.id) < (${cursor.k}, ${cursor.id})`);
  const res = await db.execute(sql`
    SELECT ${topicColumns(sql`t.score`)} FROM topics t
    WHERE ${sql.join(where, sql` AND `)}
    ORDER BY rank DESC, t.id DESC LIMIT ${limit + 1}`);
  const rows = res.rows as Row[];
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(toFeedTopic),
    nextCursor:
      rows.length > limit && last
        ? encodeCursor({ tab: "search", v: 0, k: Number(last.rank), id: Number(last.id) })
        : null,
    feedVersion: null,
  };
}
