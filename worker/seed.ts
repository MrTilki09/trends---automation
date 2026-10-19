// `npm run db:seed` adds missing sources; `npm run db:reseed` (--update) also refreshes existing ones.
import { closeDb } from "../lib/db/client";
import { seedSources } from "../lib/db/seed";
import { logger } from "../lib/logger";

seedSources({ update: process.argv.includes("--update") })
  .then((res) => logger.info(res, "seed done"))
  .catch((err) => {
    logger.fatal({ err }, "seed failed");
    process.exitCode = 1;
  })
  .finally(() => closeDb());
