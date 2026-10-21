import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import type { DB } from "../db/client";
import { apiKeys, type ApiKey } from "../db/schema";
import { TtlCache } from "../util/ttl-cache";

/*
 * API keys for /api/topics. A key is `tp_` + 32 random bytes (base64url); only its SHA-256 is stored,
 * so the full key is shown exactly once, when it is created. A fast hash is fine here (unlike
 * passwords): the key is random and long, so it cannot be guessed from the hash.
 */

const PREFIX_LEN = 10;

export const hashApiKey = (key: string) => createHash("sha256").update(key).digest("hex");

export function generateApiKey(): { key: string; keyHash: string; prefix: string } {
  const key = `tp_${randomBytes(32).toString("base64url")}`;
  return { key, keyHash: hashApiKey(key), prefix: key.slice(0, PREFIX_LEN) };
}

/** Reads the key from `Authorization: Bearer <key>` or `X-API-Key: <key>`. */
export function apiKeyFromHeaders(headers: Headers): string | null {
  const auth = headers.get("authorization");
  const bearer = auth?.match(/^Bearer\s+(\S+)$/i)?.[1];
  return bearer ?? headers.get("x-api-key")?.trim() ?? null;
}

/** Creates a key and returns it in full (the only time it is available). */
export async function createApiKey(db: DB, name: string): Promise<{ key: string; row: ApiKey }> {
  const { key, keyHash, prefix } = generateApiKey();
  const [row] = await db.insert(apiKeys).values({ name, keyHash, prefix }).returning();
  return { key, row: row! };
}

export async function listApiKeys(db: DB): Promise<ApiKey[]> {
  return db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt));
}

export async function revokeApiKey(db: DB, id: number): Promise<void> {
  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt)));
  forgetCheckedApiKeys();
}

/** The active (not revoked) key with this value, or null. */
export async function findActiveApiKey(db: DB, key: string): Promise<ApiKey | null> {
  const [row] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hashApiKey(key)), isNull(apiKeys.revokedAt)));
  return row ?? null;
}

/** Records use, at most once a minute per key. */
export async function touchApiKey(db: DB, id: number): Promise<void> {
  const minuteAgo = new Date(Date.now() - 60_000);
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(apiKeys.id, id), or(isNull(apiKeys.lastUsedAt), lt(apiKeys.lastUsedAt, minuteAgo))));
}

// Recently checked keys (hash → key id, 0 = invalid) so a busy client costs no DB query per request.
// Same process as the dashboard's server actions, so revoking clears it at once.
const checked = new TtlCache<number>(30_000, 1000);

/** Key id for a valid key, null otherwise. Cached for 30 s. */
export async function authenticateApiKey(db: DB, key: string): Promise<number | null> {
  const { value: id } = await checked.getOrCompute(hashApiKey(key), async () => {
    const row = await findActiveApiKey(db, key);
    // Best effort: "last used" is updated when the key is (re)checked, i.e. at most every 30 s.
    if (row) void touchApiKey(db, row.id).catch(() => {});
    return row?.id ?? 0;
  });
  return id || null;
}

export function forgetCheckedApiKeys(): void {
  checked.clear();
}
