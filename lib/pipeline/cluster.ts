import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { rawItems, topics } from "../db/schema";
import { extractKeywords } from "./normalize";

/*
 * Clustering = grouping raw items that describe the same real-world story into one topic.
 *
 * Rules, in order, for each item that has no topic yet:
 *   1. same canonical URL as an item of a recent topic  -> attach to that topic
 *   2. title trigram similarity >= threshold             -> attach to the most similar topic
 *   3. otherwise                                         -> start a new topic
 * "Recent" = topic last seen within CLUSTER_WINDOW_HOURS.
 *
 * Similarity is computed in TypeScript with the same algorithm as Postgres pg_trgm,
 * so the logic is unit-testable and new items in the same run can match each other.
 */

/** pg_trgm-compatible trigram set: each word is padded with 2 leading and 1 trailing space. */
export function trigrams(normalized: string): Set<string> {
  const set = new Set<string>();
  for (const word of normalized.split(/[^\p{L}\p{N}]+/u)) {
    if (!word) continue;
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i++) set.add(padded.slice(i, i + 3));
  }
  return set;
}

/** Jaccard similarity of two trigram sets (same as pg_trgm `similarity()`). */
export function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const t of small) if (large.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

export type ClusterItem = { id: number; canonicalUrl: string | null; normalizedTitle: string };
export type ClusterCandidate = { topicId: number; canonicalUrl: string | null; normalizedTitle: string };
/** `existing:<topicId>` or `new:<itemId of the first item>` */
export type ClusterKey = `existing:${number}` | `new:${number}`;

/** Pure clustering step. Returns item id -> cluster key. */
export function assignClusters(
  items: ClusterItem[],
  candidates: ClusterCandidate[],
  threshold: number,
): Map<number, ClusterKey> {
  type Entry = { key: ClusterKey; canonicalUrl: string | null; grams: Set<string> };
  const pool: Entry[] = candidates.map((c) => ({
    key: `existing:${c.topicId}`,
    canonicalUrl: c.canonicalUrl,
    grams: trigrams(c.normalizedTitle),
  }));
  const byUrl = new Map<string, ClusterKey>();
  for (const e of pool) if (e.canonicalUrl && !byUrl.has(e.canonicalUrl)) byUrl.set(e.canonicalUrl, e.key);

  const result = new Map<number, ClusterKey>();
  for (const item of items) {
    const grams = trigrams(item.normalizedTitle);
    let key: ClusterKey | undefined = item.canonicalUrl ? byUrl.get(item.canonicalUrl) : undefined;
    if (!key) {
      let best = 0;
      for (const e of pool) {
        const s = similarity(grams, e.grams);
        if (s >= threshold && s > best) {
          best = s;
          key = e.key;
        }
      }
    }
    key ??= `new:${item.id}`;
    result.set(item.id, key);
    // Make this item matchable by the items that follow it in the same batch.
    pool.push({ key, canonicalUrl: item.canonicalUrl, grams });
    if (item.canonicalUrl && !byUrl.has(item.canonicalUrl)) byUrl.set(item.canonicalUrl, key);
  }
  return result;
}

/** Recomputes source_count, item_count, first/last seen and keywords for the given topics. */
export async function refreshTopicAggregates(db: DB, topicIds: number[]): Promise<void> {
  if (topicIds.length === 0) return;
  for (let i = 0; i < topicIds.length; i += 500) {
    const ids = topicIds.slice(i, i + 500);
    await db.execute(sql`
      UPDATE topics t SET
        source_count = a.source_count,
        item_count = a.item_count,
        first_seen_at = LEAST(t.first_seen_at, a.first_seen),
        last_seen_at = a.last_seen,
        updated_at = now()
      FROM (
        SELECT topic_id, count(DISTINCT source_id)::int AS source_count, count(*)::int AS item_count,
               min(fetched_at) AS first_seen, max(last_seen_at) AS last_seen
        FROM raw_items WHERE topic_id IN ${sql.raw(`(${ids.join(",")})`)}
        GROUP BY topic_id
      ) a
      WHERE t.id = a.topic_id`);
    const titles = await db
      .select({ topicId: rawItems.topicId, normalizedTitle: rawItems.normalizedTitle })
      .from(rawItems)
      .where(inArray(rawItems.topicId, ids));
    const byTopic = new Map<number, string[]>();
    for (const r of titles) {
      if (r.topicId == null) continue;
      byTopic.set(r.topicId, [...(byTopic.get(r.topicId) ?? []), r.normalizedTitle]);
    }
    for (const [id, list] of byTopic) {
      await db
        .update(topics)
        .set({ keywords: extractKeywords(list) })
        .where(eq(topics.id, id));
    }
  }
}

/** Assigns every unclustered raw item to a topic. Idempotent: clustered items are never touched again. */
export async function clusterPendingItems(
  db: DB,
  opts: { threshold: number; windowHours: number; seenSince?: Date },
): Promise<{ topicsCreated: number; topicsUpdated: number; touchedTopicIds: number[] }> {
  const cutoff = new Date(Date.now() - opts.windowHours * 3600_000);
  const pending = await db
    .select({
      id: rawItems.id,
      canonicalUrl: rawItems.canonicalUrl,
      normalizedTitle: rawItems.normalizedTitle,
      title: rawItems.title,
      fetchedAt: rawItems.fetchedAt,
    })
    .from(rawItems)
    .where(isNull(rawItems.topicId))
    .orderBy(rawItems.id);

  const candidates = await db
    .select({
      topicId: sql<number>`${rawItems.topicId}`,
      canonicalUrl: rawItems.canonicalUrl,
      normalizedTitle: rawItems.normalizedTitle,
    })
    .from(rawItems)
    .innerJoin(topics, eq(topics.id, rawItems.topicId))
    .where(gt(topics.lastSeenAt, cutoff));

  const assignment = assignClusters(pending, candidates, opts.threshold);
  const itemsById = new Map(pending.map((p) => [p.id, p]));

  // Topics whose existing items showed up again in this run also need fresh aggregates (last_seen_at).
  const touched = new Set<number>();
  if (opts.seenSince) {
    const seen = await db
      .selectDistinct({ topicId: rawItems.topicId })
      .from(rawItems)
      .where(and(gt(rawItems.lastSeenAt, opts.seenSince), sql`${rawItems.topicId} IS NOT NULL`));
    for (const r of seen) if (r.topicId != null) touched.add(r.topicId);
  }
  let topicsCreated = 0;
  await db.transaction(async (tx) => {
    // Group item ids by cluster key.
    const groups = new Map<ClusterKey, number[]>();
    for (const [itemId, key] of assignment) groups.set(key, [...(groups.get(key) ?? []), itemId]);

    for (const [key, itemIds] of groups) {
      let topicId: number;
      if (key.startsWith("existing:")) {
        topicId = Number(key.slice("existing:".length));
      } else {
        const first = itemsById.get(Number(key.slice("new:".length)))!;
        const [row] = await tx
          .insert(topics)
          .values({
            title: first.title,
            canonicalUrl: first.canonicalUrl,
            firstSeenAt: first.fetchedAt,
            lastSeenAt: first.fetchedAt,
          })
          .returning({ id: topics.id });
        topicId = row!.id;
        topicsCreated++;
      }
      await tx
        .update(rawItems)
        .set({ topicId })
        .where(and(inArray(rawItems.id, itemIds), isNull(rawItems.topicId)));
      touched.add(topicId);
    }
  });

  const touchedTopicIds = [...touched];
  await refreshTopicAggregates(db, touchedTopicIds);
  return { topicsCreated, topicsUpdated: touchedTopicIds.length - topicsCreated, touchedTopicIds };
}
