import { eq, sql } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../auth/password";
import { decryptSecret, encryptSecret, maskSecret } from "../auth/secrets";
import type { DB } from "../db/client";
import { users, type User } from "../db/schema";
import { DEFAULT_NVIDIA_MODEL, isNvidiaModel, type NvidiaModelId } from "../llm/nvidia";

/** The user row for a signed-in username, created on first use. */
export async function ensureUser(db: DB, username: string): Promise<User> {
  const [found] = await db.select().from(users).where(eq(users.username, username));
  if (found) return found;
  await db.insert(users).values({ username }).onConflictDoNothing();
  const [row] = await db.select().from(users).where(eq(users.username, username));
  return row!;
}

export async function setNvidiaKey(
  db: DB,
  userId: number,
  apiKey: string,
  secretsKey: string,
): Promise<void> {
  await db
    .update(users)
    .set({ nvidiaApiKeyEnc: encryptSecret(apiKey, secretsKey) })
    .where(eq(users.id, userId));
}

export async function clearNvidiaKey(db: DB, userId: number): Promise<void> {
  await db.update(users).set({ nvidiaApiKeyEnc: null }).where(eq(users.id, userId));
}

export async function setNvidiaModel(db: DB, userId: number, model: NvidiaModelId): Promise<void> {
  await db.update(users).set({ nvidiaModel: model }).where(eq(users.id, userId));
}

export const DEFAULT_BRAND = "Trend Pool";

/** Watermark on generated carousel slides: the user's own brand/handle, else the app name. */
export const userBrand = (u: User): string => u.brandName?.trim() || DEFAULT_BRAND;

export async function setBrandName(db: DB, userId: number, brand: string): Promise<void> {
  await db
    .update(users)
    .set({ brandName: brand.trim().slice(0, 40) || null })
    .where(eq(users.id, userId));
}

export const userModel = (u: User): NvidiaModelId =>
  isNvidiaModel(u.nvidiaModel) ? u.nvidiaModel : DEFAULT_NVIDIA_MODEL;

/** The user's NVIDIA key in plain text (for the API call only), or null. */
export function nvidiaKeyOf(u: User, secretsKey: string | undefined): string | null {
  if (!u.nvidiaApiKeyEnc || !secretsKey) return null;
  return decryptSecret(u.nvidiaApiKeyEnc, secretsKey);
}

/** What the settings page may show: never the key itself. */
export function nvidiaKeyStatus(
  u: User,
  secretsKey: string | undefined,
): { state: "none" } | { state: "saved"; masked: string } | { state: "unreadable" } {
  if (!u.nvidiaApiKeyEnc) return { state: "none" };
  const key = nvidiaKeyOf(u, secretsKey);
  return key ? { state: "saved", masked: maskSecret(key) } : { state: "unreadable" };
}

/** What the profile page shows next to the account details. */
export async function accountStats(
  db: DB,
  userId: number,
): Promise<{ saved: number; posts: number; lastPostAt: Date | null }> {
  const res = await db.execute(sql`
    SELECT (SELECT count(*)::int FROM saved_topics WHERE user_id = ${userId}) AS saved,
           (SELECT count(*)::int FROM posts WHERE user_id = ${userId}) AS posts,
           (SELECT max(created_at) FROM posts WHERE user_id = ${userId}) AS last_post_at`);
  const r = res.rows[0] as { saved: number; posts: number; last_post_at: string | null };
  return { saved: r.saved, posts: r.posts, lastPostAt: r.last_post_at ? new Date(r.last_post_at) : null };
}

/**
 * Changes a member's password after checking the current one. The owner's password lives in .env
 * (DASHBOARD_PASSWORD_HASH) and can't be changed here.
 */
export async function changeMemberPassword(
  db: DB,
  user: User,
  current: string,
  next: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!user.passwordHash)
    return { ok: false, error: "This account's password is set in the server's .env file." };
  if (!(await verifyPassword(current, user.passwordHash))) {
    return { ok: false, error: "Your current password is wrong." };
  }
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next) })
    .where(eq(users.id, user.id));
  return { ok: true };
}

/** Deletes a member's account and, through the foreign keys, its saved topics, posts and links. */
export async function deleteMemberAccount(
  db: DB,
  user: User,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!user.passwordHash) return { ok: false, error: "The owner account can't be deleted here." };
  if (!(await verifyPassword(password, user.passwordHash))) return { ok: false, error: "Wrong password." };
  await db.delete(users).where(eq(users.id, user.id));
  return { ok: true };
}
