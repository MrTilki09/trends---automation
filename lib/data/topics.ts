import { asc, desc, eq, sql, type SQL } from "drizzle-orm";
import type { DB } from "../db/client";
import { rawItems, sources, topics, type TopicStatus } from "../db/schema";
import { normalizeTitle } from "../pipeline/normalize";

export const TOPIC_STATUSES: TopicStatus[] = ["new", "shortlisted", "ignored"];
export const TIME_WINDOWS = { "24h": 24, "72h": 72, "7d": 168 } as const;
export type TimeWindow = keyof typeof TIME_WINDOWS;

export type TopicFilters = {
  status?: TopicStatus | "all";
  source?: string; // source key
  category?: string;
  window?: TimeWindow;
  q?: string;
  limit?: number;
};

export type TopicListRow = {
  id: number;
  title: string;
  canonicalUrl: string | null;
  score: number;
  sourceCount: number;
  itemCount: number;
  category: string | null;
  status: TopicStatus;
  firstSeenAt: Date;
  lastSeenAt: Date;
  sources: { key: string; name: string }[];
  llmSummary: string | null;
};

/** The pool: topics filtered and sorted by score. */
export async function listTopics(db: DB, f: TopicFilters = {}): Promise<TopicListRow[]> {
  const hours = TIME_WINDOWS[f.window ?? "72h"];
  const where: SQL[] = [sql`t.last_seen_at > now() - make_interval(hours => ${hours})`];
  const status = f.status ?? "new";
  if (status !== "all") where.push(sql`t.status = ${status}`);
  if (f.category) where.push(sql`coalesce(t.category, t.llm_category) = ${f.category}`);
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

  const res = await db.execute(sql`
    SELECT t.id, t.title, t.canonical_url, t.score, t.source_count, t.item_count,
           coalesce(t.category, t.llm_category) AS category, t.status, t.first_seen_at, t.last_seen_at,
           t.llm_summary,
           coalesce((SELECT json_agg(DISTINCT jsonb_build_object('key', s.key, 'name', s.name))
                     FROM raw_items r JOIN sources s ON s.id = r.source_id WHERE r.topic_id = t.id), '[]') AS sources
    FROM topics t
    WHERE ${sql.join(where, sql` AND `)}
    ORDER BY t.score DESC, t.last_seen_at DESC
    LIMIT ${f.limit ?? 200}`);

  return (res.rows as Record<string, unknown>[]).map((r) => ({
    id: Number(r.id),
    title: String(r.title),
    canonicalUrl: (r.canonical_url as string | null) ?? null,
    score: Number(r.score),
    sourceCount: Number(r.source_count),
    itemCount: Number(r.item_count),
    category: (r.category as string | null) ?? null,
    status: r.status as TopicStatus,
    firstSeenAt: new Date(r.first_seen_at as string),
    lastSeenAt: new Date(r.last_seen_at as string),
    sources: r.sources as { key: string; name: string }[],
    llmSummary: (r.llm_summary as string | null) ?? null,
  }));
}

export async function listCategories(db: DB): Promise<string[]> {
  const res = await db.execute(sql`
    SELECT DISTINCT coalesce(category, llm_category) AS c FROM topics
    WHERE coalesce(category, llm_category) IS NOT NULL ORDER BY 1`);
  return (res.rows as { c: string }[]).map((r) => r.c);
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
