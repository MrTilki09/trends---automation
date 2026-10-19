import { asc, eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { sources } from "../db/schema";

export async function listSources(db: DB) {
  return db.select().from(sources).orderBy(asc(sources.type), asc(sources.key));
}

export async function setSourceEnabled(db: DB, id: number, enabled: boolean): Promise<void> {
  await db.update(sources).set({ enabled }).where(eq(sources.id, id));
}
