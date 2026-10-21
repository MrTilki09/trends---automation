import { eq } from "drizzle-orm";
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
