// `npm run collect:once`: one full collection run in the foreground (manual trigger), then exit.
// Handy for development and for checking a deploy without waiting for the hourly schedule.
import { closeDb } from "../lib/db/client";
import { logger } from "../lib/logger";
import { runCollect } from "./jobs/collect";

const shutdown = new AbortController();
process.once("SIGINT", () => shutdown.abort());
process.once("SIGTERM", () => shutdown.abort());

runCollect({ trigger: "manual", signal: shutdown.signal, logger })
  .then((res) => logger.info(res, "collect:once finished"))
  .catch((err) => {
    logger.fatal({ err }, "collect:once failed");
    process.exitCode = 1;
  })
  .finally(() => closeDb());
