import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../db/client";
import { follows, notificationSettings, users, type FollowKind, type NotificationPrefs, type User } from "../db/schema";
import { canonicalTag, CATEGORIES, COMPANY_NAMES } from "../pipeline/classify";

/* App accounts on top of Trend Pool's member accounts: profile, follows, notification settings. */

export const FOLLOW_KINDS = ["category", "company", "tag", "lang"] as const satisfies FollowKind[];
export const MAX_FOLLOWS = 60;
export const LANGS = ["en", "tr"] as const;

export const FollowInput = z.object({
  kind: z.enum(FOLLOW_KINDS),
  value: z.string().trim().min(1).max(60),
});
export type FollowInput = z.infer<typeof FollowInput>;

/**
 * Normalizes follows to what topics actually store: known categories (exact names), known companies
 * and languages, tags through the same synonyms as stored tags. Unknown values are dropped.
 */
export function normalizeFollows(input: FollowInput[]): FollowInput[] {
  const out = new Map<string, FollowInput>();
  const categories = new Map(CATEGORIES.map((c) => [c.toLowerCase(), c]));
  for (const f of input) {
    let value: string | undefined;
    if (f.kind === "category") value = categories.get(f.value.toLowerCase());
    else if (f.kind === "company") value = COMPANY_NAMES.find((c) => c === f.value.toLowerCase());
    else if (f.kind === "lang") value = (LANGS as readonly string[]).includes(f.value) ? f.value : undefined;
    else value = canonicalTag(f.value)[0];
    if (value) out.set(`${f.kind}:${value}`, { kind: f.kind, value });
  }
  return [...out.values()].slice(0, MAX_FOLLOWS);
}

export async function listFollows(db: DB, userId: number): Promise<FollowInput[]> {
  return db
    .select({ kind: follows.kind, value: follows.value })
    .from(follows)
    .where(eq(follows.userId, userId))
    .orderBy(follows.kind, follows.value);
}

/** Replaces the user's follows and marks onboarding as done. */
export async function setFollows(db: DB, userId: number, input: FollowInput[]): Promise<FollowInput[]> {
  const list = normalizeFollows(input);
  await db.transaction(async (tx) => {
    await tx.delete(follows).where(eq(follows.userId, userId));
    if (list.length) await tx.insert(follows).values(list.map((f) => ({ ...f, userId })));
    await tx
      .update(users)
      .set({ onboardedAt: sql`coalesce(${users.onboardedAt}, now())` })
      .where(eq(users.id, userId));
  });
  return list;
}

export const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

export const ProfileInput = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .regex(HANDLE_RE, "3–20 characters: letters, numbers and _")
    .optional(),
});

export async function updateProfile(
  db: DB,
  userId: number,
  input: z.infer<typeof ProfileInput>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.handle) {
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.handle, input.handle), ne(users.id, userId)));
    if (taken) return { ok: false, error: "That handle is taken." };
  }
  if (input.displayName === undefined && input.handle === undefined) return { ok: true };
  await db
    .update(users)
    .set({
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.handle !== undefined ? { handle: input.handle } : {}),
    })
    .where(eq(users.id, userId));
  return { ok: true };
}

/** Public name of a user: display name, else @handle, else the part of the email before @. */
export function publicName(u: Pick<User, "displayName" | "handle" | "username">): string {
  return u.displayName?.trim() || (u.handle ? `@${u.handle}` : u.username.split("@")[0]!.slice(0, 20));
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  breaking: true,
  digest: false,
  replies: true,
  timeZone: "Europe/Istanbul",
};

export const NotificationPrefsInput = z.object({
  breaking: z.boolean().optional(),
  digest: z.boolean().optional(),
  replies: z.boolean().optional(),
  timeZone: z
    .string()
    .max(60)
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Unknown time zone")
    .optional(),
});

export async function getNotificationPrefs(db: DB, userId: number): Promise<NotificationPrefs> {
  const [row] = await db
    .select({ prefs: notificationSettings.prefs })
    .from(notificationSettings)
    .where(eq(notificationSettings.userId, userId));
  return { ...DEFAULT_NOTIFICATION_PREFS, ...(row?.prefs ?? {}) };
}

export async function setNotificationPrefs(
  db: DB,
  userId: number,
  input: z.infer<typeof NotificationPrefsInput>,
): Promise<NotificationPrefs> {
  const prefs = { ...(await getNotificationPrefs(db, userId)), ...input };
  await db
    .insert(notificationSettings)
    .values({ userId, prefs })
    .onConflictDoUpdate({ target: notificationSettings.userId, set: { prefs } });
  return prefs;
}

export async function getMe(db: DB, user: User) {
  return {
    id: user.id,
    email: user.username.includes("@") ? user.username : null,
    displayName: user.displayName,
    handle: user.handle,
    name: publicName(user),
    onboarded: !!user.onboardedAt,
    follows: await listFollows(db, user.id),
    notifications: await getNotificationPrefs(db, user.id),
  };
}
