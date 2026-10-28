import { sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { rawItems } from "../db/schema";
import type { RawItemInput } from "../sources/types";
import { detectSignals, normalizeTags } from "./classify";
import { canonicalizeUrl, guessLang, normalizeTitle } from "./normalize";

/** Most tags kept per item (source tags + signals + the feed's own labels). */
export const MAX_ITEM_TAGS = 30;

/**
 * Removes repeated externalIds inside one batch. A feed can list an item twice, and a publisher's
 * main feed and its section feed (e.g. The Verge + The Verge AI) often carry the same article:
 * the copies are merged, so the item keeps every feed's tags and the highest metrics.
 */
export function dedupeBatch(items: RawItemInput[]): RawItemInput[] {
  const seen = new Map<string, RawItemInput>();
  for (const it of items) {
    const prev = seen.get(it.externalId);
    if (!prev) {
      seen.set(it.externalId, it);
      continue;
    }
    const metrics = { ...it.metrics, ...prev.metrics };
    for (const [k, v] of Object.entries(it.metrics)) metrics[k] = Math.max(v, prev.metrics[k] ?? v);
    seen.set(it.externalId, {
      ...prev,
      tags: [...new Set([...(prev.tags ?? []), ...(it.tags ?? [])])],
      metrics,
    });
  }
  return [...seen.values()];
}

/**
 * Stores a source's items. New items are inserted with their normalized URL/title;
 * items we already have (same source + externalId) only get fresh `metrics` and `last_seen_at`,
 * so engagement numbers stay current and nothing is ever duplicated.
 */
export async function upsertRawItems(
  db: DB,
  params: {
    sourceId: number;
    runId: number;
    items: RawItemInput[];
    defaultLang?: string;
    /** Tags configured on the source (e.g. "turkey", "startups"), added to every item. */
    sourceTags?: string[];
  },
): Promise<{ fetched: number; new: number }> {
  const items = dedupeBatch(params.items);
  let created = 0;
  const now = new Date();
  for (let i = 0; i < items.length; i += 200) {
    const chunk = items.slice(i, i + 200).map((it) => {
      const lang = it.lang ?? params.defaultLang ?? guessLang(it.title);
      const normalizedTitle = normalizeTitle(it.title, lang);
      return {
        sourceId: params.sourceId,
        runId: params.runId,
        externalId: it.externalId.slice(0, 500),
        url: it.url ?? null,
        canonicalUrl: canonicalizeUrl(it.url),
        title: it.title.slice(0, 1000),
        normalizedTitle,
        summary: it.summary ?? null,
        author: it.author ?? null,
        // Some feeds put dates slightly in the future (time zones); never trust a future date.
        publishedAt: it.publishedAt ? new Date(Math.min(it.publishedAt.getTime(), now.getTime())) : null,
        lang: lang ?? null,
        // Source tags and detected signals first, so a feed with many categories can't crowd them out.
        tags: normalizeTags(
          [...(params.sourceTags ?? []), ...detectSignals(normalizedTitle), ...(it.tags ?? [])],
          MAX_ITEM_TAGS,
        ),
        metrics: it.metrics,
        raw: it.raw ?? null,
        fetchedAt: now,
        lastSeenAt: now,
      };
    });
    const rows = await db
      .insert(rawItems)
      .values(chunk)
      .onConflictDoUpdate({
        target: [rawItems.sourceId, rawItems.externalId],
        set: {
          metrics: sql`excluded.metrics`,
          lastSeenAt: sql`excluded.last_seen_at`,
          // Keep tags/lang current too (also fills them in for items stored before they existed).
          tags: sql`excluded.tags`,
          lang: sql`excluded.lang`,
        },
      })
      // xmax = 0 is Postgres' way of telling "this row was inserted, not updated".
      .returning({ inserted: sql<boolean>`(xmax = 0)` });
    created += rows.filter((r) => r.inserted).length;
  }
  return { fetched: items.length, new: created };
}
