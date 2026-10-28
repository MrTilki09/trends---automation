// `npm run db:reindex`: recomputes publish date, tags, language, category and keywords for ALL
// topics, then rescores. Run it after changing the categorizer rules or after an upgrade.
import { eq, sql } from "drizzle-orm";
import { getConfig } from "../lib/config";
import { closeDb, getDb } from "../lib/db/client";
import { rawItems } from "../lib/db/schema";
import { logger } from "../lib/logger";
import { detectSignals, normalizeTags } from "../lib/pipeline/classify";
import { refreshTopicAggregates } from "../lib/pipeline/cluster";
import { MAX_ITEM_TAGS } from "../lib/pipeline/dedupe";
import { scoreRecentTopics } from "../lib/pipeline/score";

async function main() {
  const db = getDb();
  // 1. Recompute every item's tags (feed categories + source tags + detected signals) and fill
  //    in language for items stored before those columns existed.
  const items = await db.execute(sql`
    SELECT r.id, coalesce(r.raw->'tags', r.raw->'categories') AS cats, s.config->'tags' AS stags,
           r.normalized_title AS norm,
           coalesce(r.lang, s.config->'feeds'->0->>'lang', s.config->>'lang') AS lang, s.type,
           r.raw->>'geo' AS geo, r.title
    FROM raw_items r JOIN sources s ON s.id = r.source_id`);
  for (const row of items.rows as {
    id: number;
    cats: unknown;
    stags: unknown;
    norm: string;
    lang: string | null;
    type: string;
    geo: string | null;
    title: string;
  }[]) {
    const raw: string[] = [];
    if (Array.isArray(row.stags)) for (const t of row.stags) if (typeof t === "string") raw.push(t);
    raw.push(...detectSignals(row.norm));
    if (row.type === "google_trends") raw.push("search trend", row.geo === "TR" ? "turkey" : "usa");
    const m = row.type === "hackernews" ? row.title.match(/^(Show|Ask|Launch|Tell) HN\b/i) : null;
    if (m) raw.push(`${m[1]!.toLowerCase()} hn`);
    if (Array.isArray(row.cats))
      for (const c of row.cats) {
        if (typeof c === "string") raw.push(c);
        else if (c && typeof c === "object" && "_" in c) raw.push(String((c as { _: unknown })._));
      }
    const lang =
      row.lang ??
      (row.type === "google_trends"
        ? row.geo === "TR"
          ? "tr"
          : "en"
        : row.type === "hackernews"
          ? "en"
          : null);
    await db
      .update(rawItems)
      .set({ tags: normalizeTags(raw, MAX_ITEM_TAGS), lang })
      .where(eq(rawItems.id, row.id));
  }
  logger.info({ items: items.rows.length }, "item tags/lang recomputed");

  // 2. Recompute every topic, then rescore.
  const ids = (await db.execute(sql`SELECT id FROM topics`)).rows.map((r) =>
    Number((r as { id: number }).id),
  );
  await refreshTopicAggregates(db, ids);
  const scored = await scoreRecentTopics(db, { windowHours: getConfig().CLUSTER_WINDOW_HOURS });
  logger.info({ topics: ids.length, scored }, "reindex done");
}

main()
  .catch((err) => {
    logger.fatal({ err }, "reindex failed");
    process.exitCode = 1;
  })
  .finally(() => closeDb());
