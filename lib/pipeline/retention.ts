import { sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { pruneOldJobs } from "../data/jobs";

/**
 * Daily cleanup:
 *  - raw items older than RAW_ITEM_RETENTION_DAYS whose topic is `ignored`, still `new`, or missing,
 *  - topics left with no items (except shortlisted ones),
 *  - finished job requests older than the same retention.
 * Shortlisted topics (and later-phase statuses) and their items are never deleted.
 */
export async function runRetention(db: DB, retentionDays: number) {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const items = await db.execute(sql`
    DELETE FROM raw_items r
    WHERE r.last_seen_at < ${cutoff}
      AND (r.topic_id IS NULL OR EXISTS (
        SELECT 1 FROM topics t WHERE t.id = r.topic_id AND t.status IN ('new', 'ignored')
      ))`);
  const orphans = await db.execute(sql`
    DELETE FROM topics t
    WHERE t.status IN ('new', 'ignored')
      AND NOT EXISTS (SELECT 1 FROM raw_items r WHERE r.topic_id = t.id)`);
  const jobs = await pruneOldJobs(db, retentionDays);
  // Keep the counters on remaining topics honest after items were removed.
  await db.execute(sql`
    UPDATE topics t SET item_count = a.c, source_count = a.s
    FROM (SELECT topic_id, count(*)::int c, count(DISTINCT source_id)::int s FROM raw_items GROUP BY topic_id) a
    WHERE t.id = a.topic_id AND (t.item_count <> a.c OR t.source_count <> a.s)`);
  return { rawItemsDeleted: items.rowCount ?? 0, topicsDeleted: orphans.rowCount ?? 0, jobsDeleted: jobs };
}
