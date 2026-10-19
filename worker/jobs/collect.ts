import { eq } from "drizzle-orm";
import { getConfig } from "../../lib/config";
import { getDb, getPool } from "../../lib/db/client";
import {
  fetchRunSources,
  fetchRuns,
  sources,
  type RunStats,
  type RunStatus,
  type Source,
} from "../../lib/db/schema";
import { getLLMProvider, LLMError } from "../../lib/llm";
import type { Logger } from "../../lib/logger";
import { clusterPendingItems } from "../../lib/pipeline/cluster";
import { upsertRawItems } from "../../lib/pipeline/dedupe";
import { enrichTopTopics } from "../../lib/pipeline/enrich";
import { scoreRecentTopics } from "../../lib/pipeline/score";
import { getAdapter } from "../../lib/sources/registry";
import { mapLimit } from "../../lib/util/concurrency";

/** Fixed key for pg_advisory_lock: guarantees at most one collect run at a time, across processes. */
const COLLECT_LOCK_KEY = 727_001;
const SOURCE_CONCURRENCY = 3;

export type CollectResult =
  { skipped: true } | { skipped: false; runId: number; status: RunStatus; stats: RunStats };

export class InterruptedError extends Error {}

/**
 * One full pool run: collect -> normalize/dedupe -> cluster -> score -> (optional) enrich -> finish.
 * The heavy lifting lives in lib/; this file only orchestrates and records progress.
 */
export async function runCollect(opts: {
  trigger: "schedule" | "manual";
  signal: AbortSignal;
  logger: Logger;
}): Promise<CollectResult> {
  const cfg = getConfig();
  const db = getDb();
  const log = opts.logger;

  // Session-level advisory lock on a dedicated connection, held for the whole run.
  const lockClient = await getPool().connect();
  try {
    const { rows } = await lockClient.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [COLLECT_LOCK_KEY],
    );
    if (!rows[0]?.locked) {
      log.warn("another collect run holds the lock; skipping");
      return { skipped: true };
    }

    const [run] = await db.insert(fetchRuns).values({ trigger: opts.trigger }).returning();
    const runId = run!.id;
    const runStartedAt = run!.startedAt;
    const runLog = log.child({ runId });
    const stats: RunStats = { stepsMs: {} };
    const step = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
      if (opts.signal.aborted) throw new InterruptedError("shutdown requested");
      const t0 = Date.now();
      try {
        return await fn();
      } finally {
        stats.stepsMs![name] = Date.now() - t0;
        runLog.info({ step: name, ms: stats.stepsMs![name] }, "step finished");
      }
    };

    try {
      runLog.info({ trigger: opts.trigger }, "run started");

      // 1–2. Collect from every enabled source. One failing source never fails the run.
      const enabled = await db.select().from(sources).where(eq(sources.enabled, true)).orderBy(sources.id);
      const results = await step("collect", () =>
        mapLimit(enabled, SOURCE_CONCURRENCY, (source) =>
          collectSource(source, runId, cfg.SOURCE_TIMEOUT_MS, opts.signal, runLog),
        ),
      );
      if (opts.signal.aborted) throw new InterruptedError("shutdown requested");
      stats.sourcesTotal = enabled.length;
      stats.sourcesFailed = results.filter((r) => !r.ok).length;
      stats.itemsFetched = results.reduce((a, r) => a + r.fetched, 0);
      stats.itemsNew = results.reduce((a, r) => a + r.new, 0);

      // 3–4. Normalization happens on insert; now cluster new items into topics.
      const cluster = await step("cluster", () =>
        clusterPendingItems(db, {
          threshold: cfg.CLUSTER_SIMILARITY_THRESHOLD,
          windowHours: cfg.CLUSTER_WINDOW_HOURS,
          seenSince: new Date(runStartedAt.getTime() - 1000),
        }),
      );
      stats.topicsCreated = cluster.topicsCreated;
      stats.topicsUpdated = cluster.topicsUpdated;

      // 5. Score.
      stats.topicsScored = await step("score", () =>
        scoreRecentTopics(db, { windowHours: cfg.CLUSTER_WINDOW_HOURS }),
      );

      // 6. Optional LLM enrichment (never fails the run).
      if (!cfg.LLM_ENRICH_ENABLED) {
        stats.llm = { status: "disabled" };
      } else {
        stats.llm = await step("enrich", async () => {
          try {
            const { enriched } = await enrichTopTopics(db, getLLMProvider(), {
              topN: cfg.LLM_ENRICH_TOP_N,
              windowHours: cfg.CLUSTER_WINDOW_HOURS,
              niche: cfg.NICHE_DESCRIPTION,
              timeoutMs: cfg.LLM_TIMEOUT_MS,
            });
            if (enriched > 0) await scoreRecentTopics(db, { windowHours: cfg.CLUSTER_WINDOW_HOURS });
            return enriched > 0
              ? { status: "ok" as const, enriched }
              : { status: "skipped" as const, enriched: 0 };
          } catch (err) {
            const kind = err instanceof LLMError ? err.kind : "other";
            const message = `[${kind}] ${err instanceof Error ? err.message : String(err)}`;
            runLog.error({ err: message }, "LLM enrichment failed (run continues)");
            return { status: "error" as const, error: message };
          }
        });
      }

      // 7. Finish.
      const status: RunStatus =
        enabled.length > 0 && stats.sourcesFailed === enabled.length
          ? "failed"
          : stats.sourcesFailed > 0
            ? "partial"
            : "succeeded";
      await db
        .update(fetchRuns)
        .set({ status, stats, finishedAt: new Date() })
        .where(eq(fetchRuns.id, runId));
      runLog.info({ status, stats }, "run finished");
      return { skipped: false, runId, status, stats };
    } catch (err) {
      const interrupted = err instanceof InterruptedError || opts.signal.aborted;
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(fetchRuns)
        .set({
          status: interrupted ? "interrupted" : "failed",
          stats,
          error: message,
          finishedAt: new Date(),
        })
        .where(eq(fetchRuns.id, runId));
      runLog.error({ err: message, interrupted }, "run ended early");
      throw err;
    }
  } finally {
    await lockClient.query("SELECT pg_advisory_unlock($1)", [COLLECT_LOCK_KEY]).catch(() => {});
    lockClient.release();
  }
}

async function collectSource(
  source: Source,
  runId: number,
  timeoutMs: number,
  shutdown: AbortSignal,
  log: Logger,
): Promise<{ ok: boolean; fetched: number; new: number }> {
  const db = getDb();
  const t0 = Date.now();
  const slog = log.child({ source: source.key });
  let ok = false;
  let fetched = 0;
  let created = 0;
  let error: string | null = null;
  try {
    const adapter = getAdapter(source.type);
    if (!adapter) throw new Error(`No adapter registered for source type "${source.type}"`);
    // Per-source timeout, also cancelled when the worker shuts down.
    const signal = AbortSignal.any([shutdown, AbortSignal.timeout(timeoutMs)]);
    const items = await adapter.fetch(source.config, { signal, logger: slog });
    const cfgLang = (source.config as { lang?: unknown } | null)?.lang;
    const res = await upsertRawItems(db, {
      sourceId: source.id,
      runId,
      items,
      defaultLang: typeof cfgLang === "string" ? cfgLang : undefined,
    });
    fetched = res.fetched;
    created = res.new;
    ok = true;
    slog.info({ fetched, new: created, ms: Date.now() - t0 }, "source ok");
  } catch (err) {
    error =
      err instanceof Error
        ? err.name === "TimeoutError"
          ? `Timed out after ${timeoutMs} ms`
          : err.message
        : String(err);
    slog.warn({ err: error }, "source failed");
  }
  await db.insert(fetchRunSources).values({
    runId,
    sourceId: source.id,
    status: ok ? "succeeded" : "failed",
    itemsFetched: fetched,
    itemsNew: created,
    durationMs: Date.now() - t0,
    error,
  });
  await db
    .update(sources)
    .set(ok ? { lastSuccessAt: new Date(), lastError: null } : { lastError: error })
    .where(eq(sources.id, source.id));
  return { ok, fetched, new: created };
}
