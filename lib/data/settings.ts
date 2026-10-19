import { eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { settings } from "../db/schema";

export type WorkerHeartbeat = {
  at: string; // ISO time
  pid: number;
  startedAt: string;
  currentJob: { id: number; type: string } | null;
};

const HEARTBEAT_KEY = "worker_heartbeat";
/** The worker writes a heartbeat every minute; older than this means "offline". */
export const HEARTBEAT_STALE_MS = 3 * 60_000;

export async function writeHeartbeat(db: DB, hb: WorkerHeartbeat): Promise<void> {
  await db
    .insert(settings)
    .values({ key: HEARTBEAT_KEY, value: hb })
    .onConflictDoUpdate({ target: settings.key, set: { value: hb, updatedAt: new Date() } });
}

export async function readHeartbeat(db: DB): Promise<{ heartbeat: WorkerHeartbeat | null; online: boolean }> {
  const [row] = await db.select().from(settings).where(eq(settings.key, HEARTBEAT_KEY));
  const heartbeat = (row?.value as WorkerHeartbeat | undefined) ?? null;
  const online = heartbeat ? Date.now() - new Date(heartbeat.at).getTime() < HEARTBEAT_STALE_MS : false;
  return { heartbeat, online };
}
