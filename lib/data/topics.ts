import { asc, desc, eq, sql, type SQL } from "drizzle-orm";
import type { DB } from "../db/client";
import { rawItems, sources, topics, type TopicStatus } from "../db/schema";
import { NON_TECH_CATEGORIES, TECH_CATEGORIES, TECH_TAGS } from "../pipeline/classify";
import { normalizeTitle } from "../pipeline/normalize";

export const TOPIC_STATUSES: TopicStatus[] = ["new", "shortlisted", "ignored"];
/** "Published within" options for the pool. `null` = no limit. */
export const TIME_WINDOWS = { "6h": 6, "24h": 24, "72h": 72, "7d": 168, "30d": 720, all: null } as const;
export type TimeWindow = keyof typeof TIME_WINDOWS;
/** Sortable columns (label = dropdown text). "newest" is kept as an alias of published/desc for old links. */
export const SORTS = {
  score: "Score",
  published: "Published",
  sources: "Number of sources",
  title: "Title",
  category: "Category",
  status: "Status",
  newest: "Newest first",
} as const;
export type SortKey = keyof typeof SORTS;
export type SortDir = "asc" | "desc";

/** Direction used when a column is first clicked: numbers/dates high→low, text A→Z. */
export const DEFAULT_DIR: Record<SortKey, SortDir> = {
  score: "desc",
  published: "desc",
  sources: "desc",
  title: "asc",
  category: "asc",
  status: "asc",
  newest: "desc",
};

export const FOCUSES = { tech: "Tech only", all: "Everything" } as const;
export type Focus = keyof typeof FOCUSES;

export type TopicFilters = {
  /** "tech" (default) hides non-tech topics: politics, sports, celebrities, generic news. */
  focus?: Focus;
  status?: TopicStatus | "all";
  source?: string; // source key
  category?: string;
  tag?: string;
  lang?: string;
  window?: TimeWindow;
  sort?: SortKey;
  dir?: SortDir;
  q?: string;
  limit?: number;
  offset?: number;
};

export type TopicListRow = {
  id: number;
  title: string;
  canonicalUrl: string | null;
  score: number;
  sourceCount: number;
  itemCount: number;
  category: string | null;
  tags: string[];
  lang: string | null;
  status: TopicStatus;
  publishedAt: Date;
  firstSeenAt: Date;
  lastSeenAt: Date;
  sources: { key: string; name: string }[];
  llmSummary: string | null;
};

// A topic's publish date, falling back to when we first saw it (older rows before the column existed).
const PUBLISHED = sql.raw("coalesce(t.published_at, t.first_seen_at)");

const list = (values: string[]) =>
  sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  );

/**
 * Tech topic = tech category, or no clear non-tech category but tagged as tech
 * (by its source, e.g. a Hacker News item, or as a launch / official announcement).
 */
const TECH_ONLY = sql`(
  coalesce(t.category, t.llm_category) IN (${list(TECH_CATEGORIES)})
  OR (coalesce(t.category, t.llm_category, '') NOT IN (${list(NON_TECH_CATEGORIES)})
      AND t.tags && ARRAY[${list(TECH_TAGS)}]::text[])
)`;

function baseWhere(f: Pick<TopicFilters, "status" | "window" | "focus">): SQL[] {
  const where: SQL[] = [];
  if ((f.focus ?? "tech") === "tech") where.push(TECH_ONLY);
  const hours = TIME_WINDOWS[f.window ?? "72h"];
  if (hours != null) where.push(sql`${PUBLISHED} > now() - make_interval(hours => ${hours})`);
  const status = f.status ?? "new";
  if (status !== "all") where.push(sql`t.status = ${status}`);
  return where;
}

const SORT_EXPR: Record<SortKey, SQL> = {
  score: sql`t.score`,
  published: PUBLISHED,
  newest: PUBLISHED,
  sources: sql`t.source_count`,
  title: sql`lower(t.title)`,
  category: sql`coalesce(t.category, t.llm_category)`,
  status: sql`t.status`,
};

/** ORDER BY for a column; ties fall back to score then publish date. Empty values always go last. */
function orderBy(sort: SortKey, dir?: SortDir): SQL {
  const d = (dir ?? DEFAULT_DIR[sort]) === "asc" ? sql`ASC` : sql`DESC`;
  return sql`${SORT_EXPR[sort]} ${d} NULLS LAST, t.score DESC, ${PUBLISHED} DESC`;
}

/** The pool: topics filtered by publish date, status, category, tag, language, source and text. */
export async function listTopics(db: DB, f: TopicFilters = {}): Promise<TopicListRow[]> {
  const where = baseWhere(f);
  // Category filter matches the rule-based category or the LLM's (when enrichment is on).
  if (f.category) where.push(sql`(t.category = ${f.category} OR t.llm_category = ${f.category})`);
  if (f.tag) where.push(sql`${f.tag} = ANY(t.tags)`);
  if (f.lang) where.push(sql`t.lang = ${f.lang}`);
  if (f.source) {
    where.push(sql`EXISTS (SELECT 1 FROM raw_items r2 JOIN sources s2 ON s2.id = r2.source_id
                           WHERE r2.topic_id = t.id AND s2.key = ${f.source})`);
  }
  if (f.q?.trim()) {
    const like = `%${f.q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const normLike = `%${normalizeTitle(f.q)}%`;
    where.push(sql`(t.title ILIKE ${like} OR EXISTS (
      SELECT 1 FROM raw_items r3 WHERE r3.topic_id = t.id AND r3.normalized_title LIKE ${normLike}))`);
  }
  const order = orderBy(f.sort ?? "score", f.dir);

  const res = await db.execute(sql`
    SELECT t.id, t.title, t.canonical_url, t.score, t.source_count, t.item_count,
           coalesce(t.category, t.llm_category) AS category, t.tags, t.lang, t.status,
           ${PUBLISHED} AS published_at, t.first_seen_at, t.last_seen_at, t.llm_summary,
           coalesce((SELECT json_agg(DISTINCT jsonb_build_object('key', s.key, 'name', s.name))
                     FROM raw_items r JOIN sources s ON s.id = r.source_id WHERE r.topic_id = t.id), '[]') AS sources
    FROM topics t
    ${where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``}
    ORDER BY ${order}
    LIMIT ${f.limit ?? 200} OFFSET ${f.offset ?? 0}`);

  return (res.rows as Record<string, unknown>[]).map((r) => ({
    id: Number(r.id),
    title: String(r.title),
    canonicalUrl: (r.canonical_url as string | null) ?? null,
    score: Number(r.score),
    sourceCount: Number(r.source_count),
    itemCount: Number(r.item_count),
    category: (r.category as string | null) ?? null,
    tags: (r.tags as string[] | null) ?? [],
    lang: (r.lang as string | null) ?? null,
    status: r.status as TopicStatus,
    publishedAt: new Date(r.published_at as string),
    firstSeenAt: new Date(r.first_seen_at as string),
    lastSeenAt: new Date(r.last_seen_at as string),
    sources: r.sources as { key: string; name: string }[],
    llmSummary: (r.llm_summary as string | null) ?? null,
  }));
}

export type Facet = { value: string; count: number };

/**
 * Filter options with counts, for the current status + time window
 * (so the dropdowns only offer values that actually have topics).
 */
export async function listFacets(
  db: DB,
  f: Pick<TopicFilters, "status" | "window" | "focus">,
): Promise<{ categories: Facet[]; tags: Facet[]; langs: Facet[] }> {
  const where = baseWhere(f);
  const w = where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``;
  const facet = async (expr: SQL, from: SQL, limit: number) => {
    const res = await db.execute(sql`
      SELECT ${expr} AS value, count(*)::int AS count ${from} ${w}
      GROUP BY 1 HAVING ${expr} IS NOT NULL ORDER BY 2 DESC, 1 LIMIT ${limit}`);
    return res.rows as Facet[];
  };
  const [categories, tags, langs] = await Promise.all([
    facet(sql`coalesce(t.category, t.llm_category)`, sql`FROM topics t`, 50),
    facet(sql`tag`, sql`FROM topics t CROSS JOIN LATERAL unnest(t.tags) AS tag`, 60),
    facet(sql`t.lang`, sql`FROM topics t`, 10),
  ]);
  return { categories, tags, langs };
}

export async function getTopic(db: DB, id: number) {
  const [topic] = await db.select().from(topics).where(eq(topics.id, id));
  if (!topic) return null;
  const items = await db
    .select({
      id: rawItems.id,
      title: rawItems.title,
      url: rawItems.url,
      summary: rawItems.summary,
      author: rawItems.author,
      publishedAt: rawItems.publishedAt,
      fetchedAt: rawItems.fetchedAt,
      lastSeenAt: rawItems.lastSeenAt,
      tags: rawItems.tags,
      lang: rawItems.lang,
      metrics: rawItems.metrics,
      sourceKey: sources.key,
      sourceName: sources.name,
      sourceType: sources.type,
    })
    .from(rawItems)
    .innerJoin(sources, eq(sources.id, rawItems.sourceId))
    .where(eq(rawItems.topicId, id))
    .orderBy(asc(rawItems.fetchedAt), desc(rawItems.id));
  return { topic, items };
}

/** All status changes go through here (later: Telegram bot, approval flow). */
export async function setTopicStatus(db: DB, id: number, status: TopicStatus): Promise<void> {
  if (!TOPIC_STATUSES.includes(status)) throw new Error(`Invalid topic status: ${status}`);
  await db.update(topics).set({ status }).where(eq(topics.id, id));
}
