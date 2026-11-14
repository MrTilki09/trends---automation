// `npm run db:backfill-app`: fills the app's display fields (snippet, image, publisher) on every stored
// item, then recomputes every topic's snippet / image / publisher count. Safe to run again.
import { sql } from "drizzle-orm";
import { closeDb, getDb, getPool } from "../lib/db/client";
import { logger } from "../lib/logger";
import { refreshTopicAggregates } from "../lib/pipeline/cluster";
import { displayFields } from "../lib/pipeline/snippet";

const BATCH = 1000;

async function main() {
  const db = getDb();
  const pool = getPool();
  let lastId = 0;
  let done = 0;
  for (;;) {
    const { rows } = await pool.query<{
      id: number;
      title: string;
      summary: string | null;
      url: string | null;
      author: string | null;
      raw: unknown;
      name: string;
      type: string;
    }>(
      `SELECT r.id, r.title, r.summary, r.url, r.author, r.raw, s.name, s.type
       FROM raw_items r JOIN sources s ON s.id = r.source_id
       WHERE r.id > $1 ORDER BY r.id LIMIT $2`,
      [lastId, BATCH],
    );
    if (rows.length === 0) break;
    const fields = rows.map((r) =>
      displayFields({ ...r, sourceName: r.name, sourceType: r.type }),
    );
    await pool.query(
      `UPDATE raw_items r SET snippet = v.snippet, image_url = v.image_url, publisher = v.publisher
       FROM unnest($1::int[], $2::text[], $3::text[], $4::text[]) AS v(id, snippet, image_url, publisher)
       WHERE r.id = v.id`,
      [
        rows.map((r) => r.id),
        fields.map((f) => f.snippet),
        fields.map((f) => f.imageUrl),
        fields.map((f) => f.publisher),
      ],
    );
    lastId = rows[rows.length - 1]!.id;
    done += rows.length;
  }
  logger.info({ items: done }, "item display fields filled");

  const ids = (await db.execute(sql`SELECT id FROM topics ORDER BY id`)).rows.map((r) =>
    Number((r as { id: number }).id),
  );
  await refreshTopicAggregates(db, ids);
  logger.info({ topics: ids.length }, "topic display fields refreshed");
}

main()
  .catch((err) => {
    logger.fatal({ err }, "backfill failed");
    process.exitCode = 1;
  })
  .finally(() => closeDb());
