/*
 * Worker process: the only place where collection actually runs.
 *  - scheduler (node-cron, Istanbul time) enqueues `collect` and `cleanup` job requests,
 *  - poller claims one pending job every 10 s and executes it,
 *  - heartbeat every minute so the dashboard can show "worker online",
 *  - graceful shutdown on SIGTERM (docker stop): the current run is marked `interrupted`.
 */

import cron from "node-cron";
import { getConfig } from "../lib/config";
import { claimNextJob, enqueueJob, finishJob, markStaleAsInterrupted } from "../lib/data/jobs";
import { writeHeartbeat, type WorkerHeartbeat } from "../lib/data/settings";
import { closeDb, getDb, getPool } from "../lib/db/client";
import type { JobRequest } from "../lib/db/schema";
import { logger } from "../lib/logger";
import { runRetention } from "../lib/pipeline/retention";
import { InterruptedError, runCollect } from "./jobs/collect";

const POLL_INTERVAL_MS = 10_000;
const HEARTBEAT_INTERVAL_MS = 60_000;
const SHUTDOWN_GRACE_MS = 20_000;

const shutdown = new AbortController();
const startedAt = new Date().toISOString();
let currentJob: { id: number; type: string; promise: Promise<void> } | null = null;

async function heartbeat() {
  const hb: WorkerHeartbeat = {
    at: new Date().toISOString(),
    pid: process.pid,
    startedAt,
    currentJob: currentJob ? { id: currentJob.id, type: currentJob.type } : null,
  };
  try {
    await writeHeartbeat(getDb(), hb);
    logger.info({ currentJob: hb.currentJob }, "heartbeat");
  } catch (err) {
    logger.error({ err }, "heartbeat failed");
  }
}

async function executeJob(job: JobRequest): Promise<void> {
  const db = getDb();
  const log = logger.child({ jobId: job.id, jobType: job.type });
  log.info("job started");
  try {
    switch (job.type) {
      case "collect": {
        const trigger = (job.payload as { trigger?: string }).trigger === "schedule" ? "schedule" : "manual";
        const res = await runCollect({ trigger, signal: shutdown.signal, logger: log });
        await finishJob(db, job.id, "done", res.skipped ? "Skipped: another run was in progress" : undefined);
        break;
      }
      case "cleanup": {
        const res = await runRetention(db, getConfig().RAW_ITEM_RETENTION_DAYS);
        log.info(res, "retention cleanup done");
        await finishJob(db, job.id, "done");
        break;
      }
      default:
        await finishJob(db, job.id, "failed", `Unknown job type "${job.type}"`);
    }
    log.info("job finished");
  } catch (err) {
    const interrupted = err instanceof InterruptedError || shutdown.signal.aborted;
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message }, interrupted ? "job interrupted" : "job failed");
    await finishJob(db, job.id, interrupted ? "interrupted" : "failed", message).catch(() => {});
  }
}

async function poll() {
  if (currentJob || shutdown.signal.aborted) return;
  try {
    const job = await claimNextJob(getDb());
    if (!job) return;
    const promise = executeJob(job).finally(() => {
      currentJob = null;
      void heartbeat();
    });
    currentJob = { id: job.id, type: job.type, promise };
    void heartbeat();
  } catch (err) {
    logger.error({ err }, "poll failed");
  }
}

async function main() {
  // Fail fast with a readable message if the env is wrong.
  let cfg;
  try {
    cfg = getConfig();
  } catch (err) {
    logger.fatal((err as Error).message);
    process.exit(1);
  }
  for (const [name, expr] of [
    ["COLLECT_CRON", cfg.COLLECT_CRON],
    ["CLEANUP_CRON", cfg.CLEANUP_CRON],
  ] as const) {
    if (!cron.validate(expr)) {
      logger.fatal(`${name} is not a valid cron expression: "${expr}"`);
      process.exit(1);
    }
  }

  await getPool().query("SELECT 1");
  const db = getDb();
  const recovered = await markStaleAsInterrupted(db);
  if (recovered.jobs || recovered.runs)
    logger.warn(recovered, "marked leftovers from a previous crash as interrupted");

  cron.schedule(
    cfg.COLLECT_CRON,
    async () => {
      const job = await enqueueJob(getDb(), "collect", { trigger: "schedule" }).catch((err) => {
        logger.error({ err }, "failed to enqueue scheduled collect");
        return null;
      });
      logger.info(
        { jobId: job?.id ?? null },
        job ? "scheduled collect enqueued" : "collect already queued; skipped",
      );
      void poll();
    },
    { timezone: cfg.TZ, name: "collect" },
  );
  cron.schedule(
    cfg.CLEANUP_CRON,
    async () => {
      await enqueueJob(getDb(), "cleanup").catch((err) => logger.error({ err }, "failed to enqueue cleanup"));
    },
    { timezone: cfg.TZ, name: "cleanup" },
  );

  await heartbeat();
  const hbTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
  const pollTimer = setInterval(poll, POLL_INTERVAL_MS);
  void poll();

  logger.info(
    {
      collectCron: cfg.COLLECT_CRON,
      cleanupCron: cfg.CLEANUP_CRON,
      tz: cfg.TZ,
      llmEnrich: cfg.LLM_ENRICH_ENABLED,
    },
    "worker started",
  );

  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, "shutting down");
    clearInterval(hbTimer);
    clearInterval(pollTimer);
    for (const task of cron.getTasks().values()) await task.stop();
    shutdown.abort(new InterruptedError(`worker received ${signal}`));
    if (currentJob) {
      const timeout = new Promise((r) => setTimeout(r, SHUTDOWN_GRACE_MS));
      await Promise.race([currentJob.promise, timeout]);
      if (currentJob) await markStaleAsInterrupted(getDb()).catch(() => {});
    }
    await closeDb().catch(() => {});
    logger.info("bye");
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("SIGINT", () => void stop("SIGINT"));
}

main().catch((err) => {
  logger.fatal({ err }, "worker crashed on startup");
  process.exit(1);
});
