import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb, getPool } from "./client";

/** Applies pending SQL migrations from lib/db/migrations (safe to run repeatedly). */
export async function runMigrations(): Promise<void> {
  // The pg_trgm extension must exist before the trigram index is created.
  await getPool().query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  const migrationsFolder = process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), "lib/db/migrations");
  await migrate(getDb(), { migrationsFolder });
}
