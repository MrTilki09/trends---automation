import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getConfig } from "../config";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;

// Keep one pool per process. In `next dev`, modules are reloaded on every change,
// so the pool lives on globalThis to avoid leaking connections.
const globalForDb = globalThis as unknown as { __pgPool?: Pool; __db?: DB };

export function getPool(): Pool {
  if (!globalForDb.__pgPool) {
    globalForDb.__pgPool = new Pool({ connectionString: getConfig().DATABASE_URL, max: 10 });
  }
  return globalForDb.__pgPool;
}

export function getDb(): DB {
  if (!globalForDb.__db) {
    globalForDb.__db = drizzle(getPool(), { schema });
  }
  return globalForDb.__db;
}

export async function closeDb(): Promise<void> {
  await globalForDb.__pgPool?.end();
  globalForDb.__pgPool = undefined;
  globalForDb.__db = undefined;
}
