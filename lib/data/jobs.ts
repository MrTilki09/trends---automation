import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { fetchRuns, jobRequests, type JobRequest, type JobType } from "../db/schema";

/*
 * The database is the job queue. The dashboard (or the scheduler) inserts a `pending` row;
 * the worker claims it with FOR UPDATE SKIP LOCKED, so two pollers can never take the same job.
 * Upgrade path when needed: pg-boss or Trigger.dev.
 */

/** Adds a job unless one of the same type is already pending/running. Returns null if skipped. */
export async function enqueueJob(
  db: DB,
  type: JobType,
  payload: Record<string, unknown> = {},
): Promise<JobRequest | null> {
  const active = await db
    .select({ id: jobRequests.id })
    .from(jobRequests)
    .where(and(eq(jobRequests.type, type), inArray(jobRequests.status, ["pending", "running"])))
    .limit(1);
  if (active.length > 0) return null;
  const [row] = await db.insert(jobRequests).values({ type, payload }).returning();
  return row ?? null;
}

/** Atomically claims the oldest pending job and marks it running. */
export async function claimNextJob(db: DB): Promise<JobRequest | null> {
  const res = await db.execute(sql`
    UPDATE job_requests SET status = 'running', started_at = now()
    WHERE id = (
      SELECT id FROM job_requests WHERE status = 'pending'
      ORDER BY requested_at, id
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`);
  const id = (res.rows[0] as { id: number } | undefined)?.id;
  if (id == null) return null;
  const [job] = await db.select().from(jobRequests).where(eq(jobRequests.id, id));
  return job ?? null;
}

export async function finishJob(
  db: DB,
  id: number,
  status: "done" | "failed" | "interrupted",
  error?: string,
) {
  await db
    .update(jobRequests)
    .set({ status, finishedAt: new Date(), error: error ?? null })
    .where(eq(jobRequests.id, id));
}

/** Called on worker start: anything still "running" belongs to a crashed/killed worker. */
export async function markStaleAsInterrupted(db: DB): Promise<{ jobs: number; runs: number }> {
  const jobs = await db
    .update(jobRequests)
    .set({
      status: "interrupted",
      finishedAt: new Date(),
      error: "Worker stopped while this job was running",
    })
    .where(eq(jobRequests.status, "running"))
    .returning({ id: jobRequests.id });
  const runs = await db
    .update(fetchRuns)
    .set({
      status: "interrupted",
      finishedAt: new Date(),
      error: "Worker stopped while this run was running",
    })
    .where(eq(fetchRuns.status, "running"))
    .returning({ id: fetchRuns.id });
  return { jobs: jobs.length, runs: runs.length };
}

/** Whether a collect job is waiting or running (the dashboard disables "Run now" then). */
export async function hasActiveCollect(db: DB): Promise<boolean> {
  const rows = await db
    .select({ id: jobRequests.id })
    .from(jobRequests)
    .where(and(eq(jobRequests.type, "collect"), inArray(jobRequests.status, ["pending", "running"])))
    .limit(1);
  return rows.length > 0;
}

export async function recentJobs(db: DB, limit = 20) {
  return db.select().from(jobRequests).orderBy(desc(jobRequests.requestedAt)).limit(limit);
}

export async function pruneOldJobs(db: DB, olderThanDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
  const rows = await db
    .delete(jobRequests)
    .where(
      and(
        inArray(jobRequests.status, ["done", "failed", "interrupted"]),
        lt(jobRequests.requestedAt, cutoff),
      ),
    )
    .returning({ id: jobRequests.id });
  return rows.length;
}
