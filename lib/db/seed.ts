import { and, eq, inArray, sql } from "drizzle-orm";
import { retiredSourceKeys, sourceSeeds, type SourceSeed } from "../../config/sources.seed";
import { sourceTypes } from "../sources/registry";
import { getDb } from "./client";
import { sources } from "./schema";

/**
 * Inserts seed sources that don't exist yet. With `update: true`, existing sources get their
 * name/type/config/weight refreshed from the seed file; `enabled` is never overwritten
 * (that's the owner's choice in the dashboard). Sources listed in `retiredSourceKeys` (merged into
 * another source) are switched off; their stored items stay.
 */
export async function seedSources(
  opts: { update?: boolean; seeds?: SourceSeed[] } = {},
): Promise<{ inserted: number; updated: number; retired: number }> {
  const seeds = opts.seeds ?? sourceSeeds;
  for (const s of seeds) {
    if (!sourceTypes.includes(s.type)) throw new Error(`Seed "${s.key}" has unknown type "${s.type}"`);
  }
  const db = getDb();
  let inserted = 0;
  let updated = 0;
  for (const s of seeds) {
    const values = {
      key: s.key,
      name: s.name,
      type: s.type,
      enabled: s.enabled ?? true,
      weight: s.weight ?? 1,
      config: s.config,
    };
    const q = db.insert(sources).values(values);
    const rows = opts.update
      ? await q
          .onConflictDoUpdate({
            target: sources.key,
            set: {
              name: values.name,
              type: values.type,
              weight: values.weight,
              config: values.config,
              updatedAt: new Date(),
            },
          })
          .returning({ inserted: sql<boolean>`(xmax = 0)` })
      : await q
          .onConflictDoNothing({ target: sources.key })
          .returning({ inserted: sql<boolean>`(xmax = 0)` });
    for (const r of rows) {
      if (r.inserted) inserted++;
      else updated++;
    }
  }
  const retired = retiredSourceKeys.length
    ? await db
        .update(sources)
        .set({ enabled: false, updatedAt: new Date() })
        .where(and(inArray(sources.key, retiredSourceKeys), eq(sources.enabled, true)))
        .returning({ id: sources.id })
    : [];
  return { inserted, updated, retired: retired.length };
}
