import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { DB } from "../db/client";
import { appSessions, users, type User } from "../db/schema";

/*
 * App sign-in (Trend Feed). Two tokens per device:
 *   - access token: `ta1.<base64url(json)>.<hmac>` signed with a key derived from SESSION_SECRET,
 *     valid 15 minutes, checked without a DB lookup for the signature (the session row is still
 *     checked, so logout and account deletion take effect at once);
 *   - refresh token: 32 random bytes, valid 30 days, stored only as SHA-256 in app_sessions and
 *     replaced on every refresh (a stolen, already-used refresh token stops working).
 * API keys (/api/topics) are server-to-server keys and are never used by the app.
 */

export const ACCESS_TTL_SEC = 15 * 60;
export const REFRESH_TTL_DAYS = 30;
const PREFIX = "ta1";

type AccessClaims = { uid: number; sid: number; exp: number };

const accessKey = (secret: string) => createHmac("sha256", secret).update("trend-feed app access v1").digest();
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function signAccessToken(claims: AccessClaims, secret: string): string {
  const data = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const mac = createHmac("sha256", accessKey(secret)).update(data).digest("base64url");
  return `${PREFIX}.${data}.${mac}`;
}

/** Claims of a valid, unexpired access token, else null. */
export function verifyAccessToken(
  token: string | null | undefined,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): AccessClaims | null {
  if (!token || token.length > 500) return null;
  const [prefix, data, mac, extra] = token.split(".");
  if (prefix !== PREFIX || !data || !mac || extra !== undefined) return null;
  const expected = Buffer.from(createHmac("sha256", accessKey(secret)).update(data).digest("base64url"));
  const given = Buffer.from(mac);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const c = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as Partial<AccessClaims>;
    if (!Number.isInteger(c.uid) || !Number.isInteger(c.sid) || typeof c.exp !== "number") return null;
    return c.exp > nowSec ? (c as AccessClaims) : null;
  } catch {
    return null;
  }
}

export type TokenPair = { accessToken: string; refreshToken: string; expiresIn: number };

function pair(userId: number, sessionId: number, refreshToken: string, secret: string, now: Date): TokenPair {
  const exp = Math.floor(now.getTime() / 1000) + ACCESS_TTL_SEC;
  return {
    accessToken: signAccessToken({ uid: userId, sid: sessionId, exp }, secret),
    refreshToken,
    expiresIn: ACCESS_TTL_SEC,
  };
}

/** Starts a session for a signed-in user (one per device). */
export async function createAppSession(
  db: DB,
  userId: number,
  device: string | undefined,
  secret: string,
  now = new Date(),
): Promise<TokenPair> {
  const refreshToken = randomBytes(32).toString("base64url");
  const [row] = await db
    .insert(appSessions)
    .values({
      userId,
      refreshHash: sha256(refreshToken),
      device: device?.slice(0, 100) || null,
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + REFRESH_TTL_DAYS * 86_400_000),
    })
    .returning({ id: appSessions.id });
  return pair(userId, row!.id, refreshToken, secret, now);
}

/** Swaps a refresh token for a new pair (the old refresh token stops working). Null = sign in again. */
export async function refreshAppSession(
  db: DB,
  refreshToken: string,
  secret: string,
  now = new Date(),
): Promise<TokenPair | null> {
  if (!refreshToken || refreshToken.length > 100) return null;
  const next = randomBytes(32).toString("base64url");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: appSessions.id, userId: appSessions.userId, banned: users.bannedAt })
      .from(appSessions)
      .innerJoin(users, eq(users.id, appSessions.userId))
      .where(
        and(
          eq(appSessions.refreshHash, sha256(refreshToken)),
          isNull(appSessions.revokedAt),
          gt(appSessions.expiresAt, now),
        ),
      )
      .for("update");
    if (!row) return null;
    await tx
      .update(appSessions)
      .set({
        refreshHash: sha256(next),
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + REFRESH_TTL_DAYS * 86_400_000),
      })
      .where(eq(appSessions.id, row.id));
    return pair(row.userId, row.id, next, secret, now);
  });
}

export async function revokeAppSession(db: DB, refreshToken: string, now = new Date()): Promise<void> {
  if (!refreshToken || refreshToken.length > 100) return;
  await db
    .update(appSessions)
    .set({ revokedAt: now })
    .where(and(eq(appSessions.refreshHash, sha256(refreshToken)), isNull(appSessions.revokedAt)));
}

/** The signed-in user behind `Authorization: Bearer <access token>`, or null (anonymous / invalid). */
export async function userFromRequest(db: DB, headers: Headers, secret: string | undefined): Promise<User | null> {
  if (!secret) return null;
  const h = headers.get("authorization");
  const token = h?.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null;
  const claims = verifyAccessToken(token, secret);
  if (!claims) return null;
  const [row] = await db
    .select({ user: users })
    .from(appSessions)
    .innerJoin(users, eq(users.id, appSessions.userId))
    .where(
      and(eq(appSessions.id, claims.sid), eq(appSessions.userId, claims.uid), isNull(appSessions.revokedAt)),
    );
  return row?.user ?? null;
}

/** Whether an Authorization header was sent at all (so a bad token answers 401, not anonymous data). */
export const sentAuth = (headers: Headers) => !!headers.get("authorization");
