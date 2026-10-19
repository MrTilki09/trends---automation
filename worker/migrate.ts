// One-off entry point (the `migrate` Docker service): apply migrations, add missing seed sources, exit.
import { closeDb } from "../lib/db/client";
import { runMigrations } from "../lib/db/migrate";
import { seedSources } from "../lib/db/seed";
import { logger } from "../lib/logger";

async function main() {
  await runMigrations();
  logger.info("migrations applied");
  const res = await seedSources();
  logger.info(res, "seed sources checked");
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    logger.fatal({ err }, "migration failed");
    await closeDb().catch(() => {});
    process.exit(1);
  });
