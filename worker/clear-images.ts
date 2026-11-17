// `npm run db:clear-images` (or `node dist/clear-images.js` in Docker): removes stored publisher
// images from sources we may not republish (lib/sources/images.ts sourceImagesAllowed):
//   - raw_items.image_url and the `image` key inside raw_items.raw,
//   - topics.image_url when it no longer belongs to one of the topic's items.
// Images from company newsrooms, GitHub cards and sources with config.imagesAllowed = true stay.
// `--dry-run` only counts. Safe to run again.
import { closeDb, getPool } from "../lib/db/client";
import { logger } from "../lib/logger";

// Same rule as sourceImagesAllowed / imageAllowedSql, without the APP_IMAGES switch.
const ALLOWED = `coalesce((s.config->>'imagesAllowed')::boolean,
  (s.config->'tags') @> '["official"]'::jsonb OR s.type = 'github_repos')`;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();

  const count = async () => {
    const { rows } = await pool.query<{ items: number; raw: number; topics: number }>(`
      SELECT
        (SELECT count(*)::int FROM raw_items r JOIN sources s ON s.id = r.source_id
          WHERE r.image_url IS NOT NULL AND NOT ${ALLOWED}) AS items,
        (SELECT count(*)::int FROM raw_items r JOIN sources s ON s.id = r.source_id
          WHERE jsonb_typeof(r.raw) = 'object' AND r.raw ? 'image' AND NOT ${ALLOWED}) AS raw,
        (SELECT count(*)::int FROM topics t WHERE t.image_url IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM raw_items r JOIN sources s ON s.id = r.source_id
          WHERE r.topic_id = t.id AND r.image_url = t.image_url AND ${ALLOWED})) AS topics`);
    return rows[0]!;
  };

  const before = await count();
  logger.info({ ...before, dryRun }, "publisher images to remove");
  if (dryRun) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      UPDATE raw_items r SET image_url = NULL,
        raw = CASE WHEN jsonb_typeof(r.raw) = 'object' THEN r.raw - 'image' ELSE r.raw END
      FROM sources s
      WHERE s.id = r.source_id AND NOT ${ALLOWED}
        AND (r.image_url IS NOT NULL OR (jsonb_typeof(r.raw) = 'object' AND r.raw ? 'image'))`);
    // Topics keep an allowed image if they have one, else none.
    await client.query(`
      UPDATE topics t SET image_url = (
        SELECT r.image_url FROM raw_items r JOIN sources s ON s.id = r.source_id
        WHERE r.topic_id = t.id AND r.image_url IS NOT NULL
        ORDER BY s.weight DESC, r.id LIMIT 1)
      WHERE t.image_url IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM raw_items r WHERE r.topic_id = t.id AND r.image_url = t.image_url)`);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  logger.info(await count(), "publisher images left (should be 0)");
}

main()
  .catch((err) => {
    logger.error({ err }, "clear-images failed");
    process.exitCode = 1;
  })
  .finally(() => closeDb());
