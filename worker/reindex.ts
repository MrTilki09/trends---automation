// `npm run db:reindex`: recomputes publish date, tags, language, category and keywords for ALL
// topics, then rescores. Run it after changing the categorizer rules or after an upgrade.
import { eq, sql } from "drizzle-orm";
import { getConfig } from "../lib/config";
import { closeDb, getDb } from "../lib/db/client";
import { rawItems } from "../lib/db/schema";
import { logger } from "../lib/logger";
import { normalizeTags } from "../lib/pipeline/classify";
import { refreshTopicAggregates } from "../lib/pipeline/cluster";
import { scoreRecentTopics } from "../lib/pipeline/score";

async function main() {
  const db = getDb();
  // 1. Fill in item tags/lang for items stored before those columns existed:
  //    feed categories (kept in raw) + the source's configured tags + the source's language.
  const items = await db.execute(sql`
    SELECT r.id, r.raw->'categories' AS cats, s.config->'tags' AS stags,
           coalesce(r.lang, s.config->'feeds'->0->>'lang', s.config->>'lang') AS lang, s.type,
           r.raw->>'geo' AS geo, r.title
    FROM raw_items r JOIN sources s ON s.id = r.source_id
    WHERE cardinality(r.tags) = 0 OR r.lang IS NULL`);
  for (const row of items.rows as {
    id: number;
    cats: unknown;
    stags: unknown;
    lang: string | null;
    type: string;
    geo: string | null;
    title: string;
  }[]) {
    const raw: string[] = [];
    if (Array.isArray(row.cats)) for (const c of row.cats) if (typeof c === "string") raw.push(c);
    if (row.type === "google_trends") raw.push("search trend", row.geo === "TR" ? "turkey" : "usa");
    const m = row.type === "hackernews" ? row.title.match(/^(Show|Ask|Launch|Tell) HN\b/i) : null;
    if (m) raw.push(`${m[1]!.toLowerCase()} hn`);
    if (Array.isArray(row.stags)) for (const t of row.stags) if (typeof t === "string") raw.push(t);
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
      .set({ tags: normalizeTags(raw), lang })
      .where(eq(rawItems.id, row.id));
  }
  logger.info({ items: items.rows.length }, "item tags/lang backfilled");

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
