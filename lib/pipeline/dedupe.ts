import { sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { rawItems } from "../db/schema";
import type { RawItemInput } from "../sources/types";
import { normalizeTags } from "./classify";
import { canonicalizeUrl, guessLang, normalizeTitle } from "./normalize";

/** Removes repeated externalIds inside one batch (a feed can list the same item twice). */
export function dedupeBatch(items: RawItemInput[]): RawItemInput[] {
  const seen = new Map<string, RawItemInput>();
  for (const it of items) if (!seen.has(it.externalId)) seen.set(it.externalId, it);
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
      return {
        sourceId: params.sourceId,
        runId: params.runId,
        externalId: it.externalId.slice(0, 500),
        url: it.url ?? null,
        canonicalUrl: canonicalizeUrl(it.url),
        title: it.title.slice(0, 1000),
        normalizedTitle: normalizeTitle(it.title, lang),
        summary: it.summary ?? null,
        author: it.author ?? null,
        // Some feeds put dates slightly in the future (time zones); never trust a future date.
        publishedAt: it.publishedAt ? new Date(Math.min(it.publishedAt.getTime(), now.getTime())) : null,
        lang: lang ?? null,
        tags: normalizeTags([...(it.tags ?? []), ...(params.sourceTags ?? [])]),
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
