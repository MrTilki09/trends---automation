import { desc, eq, inArray } from "drizzle-orm";
import type { DB } from "../db/client";
import { fetchRunSources, fetchRuns, sources } from "../db/schema";

export async function listRuns(db: DB, limit = 50) {
  const runs = await db.select().from(fetchRuns).orderBy(desc(fetchRuns.startedAt)).limit(limit);
  if (runs.length === 0) return [];
  const perSource = await db
    .select({
      runId: fetchRunSources.runId,
      status: fetchRunSources.status,
      itemsFetched: fetchRunSources.itemsFetched,
      itemsNew: fetchRunSources.itemsNew,
      durationMs: fetchRunSources.durationMs,
      error: fetchRunSources.error,
      sourceKey: sources.key,
      sourceName: sources.name,
    })
    .from(fetchRunSources)
    .innerJoin(sources, eq(sources.id, fetchRunSources.sourceId))
    .where(
      inArray(
        fetchRunSources.runId,
        runs.map((r) => r.id),
      ),
    )
    .orderBy(fetchRunSources.id);
  return runs.map((run) => ({ ...run, sources: perSource.filter((s) => s.runId === run.id) }));
}

export async function latestRun(db: DB) {
  const [run] = await db.select().from(fetchRuns).orderBy(desc(fetchRuns.startedAt)).limit(1);
  return run ?? null;
}
