import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { rawItems, topics } from "../db/schema";
import { classify, topByFrequency } from "./classify";
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

/**
 * Pure clustering step. Returns item id -> cluster key. Each item joins the most similar title
 * (earliest on ties) among the candidates and the items before it, if similarity >= threshold.
 *
 * Speed: comparing every item with every title is quadratic (minutes at ~10k items). Prefix
 * filtering gives the same answer much faster: with trigrams ordered rarest-first, two titles with
 * similarity >= threshold always share a trigram within each one's first
 * |set| - ceil(threshold * |set|) + 1 trigrams, so only those are indexed and looked up.
 */
export function assignClusters(
  items: ClusterItem[],
  candidates: ClusterCandidate[],
  threshold: number,
): Map<number, ClusterKey> {
  // Trigrams as numbers, rarest first: each title becomes a sorted Int32Array.
  const candSets = candidates.map((c) => trigrams(c.normalizedTitle));
  const itemSets = items.map((i) => trigrams(i.normalizedTitle));
  const freq = new Map<string, number>();
  for (const set of [...candSets, ...itemSets]) for (const t of set) freq.set(t, (freq.get(t) ?? 0) + 1);
  const rank = new Map(
    [...freq.keys()]
      .sort((a, b) => freq.get(a)! - freq.get(b)! || (a < b ? -1 : a > b ? 1 : 0))
      .map((t, i) => [t, i] as const),
  );
  const encode = (set: Set<string>) => Int32Array.from(set, (t) => rank.get(t)!).sort();
  const prefixLength = (n: number) => Math.max(0, n - Math.ceil(threshold * n) + 1);
  /** Jaccard of two sorted id arrays (same value as `similarity` on the sets). */
  const jaccard = (a: Int32Array, b: Int32Array) => {
    if (a.length === 0 || b.length === 0) return 0;
    let i = 0;
    let j = 0;
    let shared = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        shared++;
        i++;
        j++;
      } else if (a[i]! < b[j]!) i++;
      else j++;
    }
    return shared / (a.length + b.length - shared);
  };

  const pool: { key: ClusterKey; grams: Int32Array }[] = [];
  const index = new Map<number, number[]>(); // trigram id -> positions in `pool`
  const addToPool = (key: ClusterKey, grams: Int32Array) => {
    const pos = pool.length;
    pool.push({ key, grams });
    for (let k = 0; k < prefixLength(grams.length); k++) {
      const list = index.get(grams[k]!);
      if (list) list.push(pos);
      else index.set(grams[k]!, [pos]);
    }
  };
  const byUrl = new Map<string, ClusterKey>();
  candidates.forEach((c, i) => {
    const key: ClusterKey = `existing:${c.topicId}`;
    addToPool(key, encode(candSets[i]!));
    if (c.canonicalUrl && !byUrl.has(c.canonicalUrl)) byUrl.set(c.canonicalUrl, key);
  });

  const checkedBy = new Int32Array(candidates.length + items.length).fill(-1);
  const result = new Map<number, ClusterKey>();
  items.forEach((item, i) => {
    const grams = encode(itemSets[i]!);
    let key: ClusterKey | undefined = item.canonicalUrl ? byUrl.get(item.canonicalUrl) : undefined;
    if (!key) {
      let best = 0;
      let bestPos = Infinity;
      // Similarity >= threshold is impossible when the sizes differ too much.
      const minLen = threshold * grams.length;
      const maxLen = threshold > 0 ? grams.length / threshold : Infinity;
      for (let k = 0; k < prefixLength(grams.length); k++) {
        for (const pos of index.get(grams[k]!) ?? []) {
          if (checkedBy[pos] === i) continue;
          checkedBy[pos] = i;
          const other = pool[pos]!.grams;
          if (other.length < minLen || other.length > maxLen) continue;
          const s = jaccard(grams, other);
          if (s > 0 && s >= threshold && (s > best || (s === best && pos < bestPos))) {
            best = s;
            bestPos = pos;
            key = pool[pos]!.key;
          }
        }
      }
    }
    key ??= `new:${item.id}`;
    result.set(item.id, key);
    // Make this item matchable by the items that follow it in the same batch.
    addToPool(key, grams);
    if (item.canonicalUrl && !byUrl.has(item.canonicalUrl)) byUrl.set(item.canonicalUrl, key);
  });
  return result;
}

/**
 * Recomputes everything a topic derives from its items: counts, first/last seen, publish date,
 * keywords, tags, language and category.
 */
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
        published_at = a.published,
        updated_at = now()
      FROM (
        SELECT topic_id, count(DISTINCT source_id)::int AS source_count, count(*)::int AS item_count,
               min(fetched_at) AS first_seen, max(last_seen_at) AS last_seen,
               -- the story's "upload date": its earliest article (or when we first saw it)
               min(coalesce(published_at, fetched_at)) AS published
        FROM raw_items WHERE topic_id IN ${sql.raw(`(${ids.join(",")})`)}
        GROUP BY topic_id
      ) a
      WHERE t.id = a.topic_id`);
    const rows = await db
      .select({
        topicId: rawItems.topicId,
        normalizedTitle: rawItems.normalizedTitle,
        tags: rawItems.tags,
        lang: rawItems.lang,
        summary: rawItems.summary,
      })
      .from(rawItems)
      .where(inArray(rawItems.topicId, ids));
    const byTopic = new Map<number, typeof rows>();
    for (const r of rows) {
      if (r.topicId == null) continue;
      byTopic.set(r.topicId, [...(byTopic.get(r.topicId) ?? []), r]);
    }
    for (const [id, items] of byTopic) {
      const titles = items.map((r) => r.normalizedTitle);
      const allTags = items.flatMap((r) => r.tags);
      const langs = items.map((r) => r.lang).filter((l): l is string => !!l);
      const { category } = classify({
        titles,
        tags: allTags,
        summaries: items.map((r) => r.summary ?? "").filter(Boolean),
      });
      await db
        .update(topics)
        .set({
          keywords: extractKeywords(titles),
          // Generous, so the Pool's tag filter finds a topic by any common label of its articles.
          tags: topByFrequency(allTags, 30),
          lang: topByFrequency(langs, 1)[0] ?? null,
          category,
        })
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
