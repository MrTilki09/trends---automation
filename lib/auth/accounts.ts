import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { DB } from "../db/client";
import { emailTokens, users } from "../db/schema";
import type { MemberLookup } from "./login";
import { hashPassword, verifyPassword } from "./password";

/*
 * Signup accounts ("members"): email + password, usable only after the email is confirmed with a
 * one-time link. The account's username is its lowercased email. Tokens are random (32 bytes) and
 * stored only as SHA-256; a new link replaces older unused ones of the same kind.
 *
 * Opening a link never uses it up (mail scanners pre-open links): the page shows a form, and the link
 * is spent when that form is sent. Completing a link always involves the password, typed by whoever
 * holds the inbox. So someone who signs up with another person's email can't end up owning that
 * account: the inbox owner either doesn't know their password or replaces it right there.
 */

export const VERIFY_TOKEN_HOURS = 24;
export const RESET_TOKEN_HOURS = 1;

export type TokenPurpose = "verify_email" | "reset_password";
const TOKEN_HOURS: Record<TokenPurpose, number> = {
  verify_email: VERIFY_TOKEN_HOURS,
  reset_password: RESET_TOKEN_HOURS,
};
export const MIN_PASSWORD_LENGTH = 10;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

// Practical check (one @, a dot in the domain, no spaces); the emailed link is the real proof.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSignup(input: {
  email: string;
  password: string;
  confirm: string;
}): { ok: true; email: string } | { ok: false; error: string } {
  const email = normalizeEmail(input.email);
  if (!EMAIL_RE.test(email) || email.length > 254)
    return { ok: false, error: "Enter a valid email address." };
  const password = validateNewPassword(input.password, input.confirm);
  return password.ok ? { ok: true, email } : password;
}

export const isValidEmail = (email: string) => EMAIL_RE.test(normalizeEmail(email));

export function validateNewPassword(
  password: string,
  confirm: string,
): { ok: true } | { ok: false; error: string } {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password.length > 200) return { ok: false, error: "That password is too long." };
  if (password !== confirm) return { ok: false, error: "The passwords don't match." };
  return { ok: true };
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** A fresh one-time token (older unused ones of the same kind stop working). Returns the plain token. */
export async function createEmailToken(
  db: DB,
  userId: number,
  purpose: TokenPurpose,
  now = new Date(),
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.transaction(async (tx) => {
    await tx
      .update(emailTokens)
      .set({ usedAt: now })
      .where(
        and(eq(emailTokens.userId, userId), eq(emailTokens.purpose, purpose), isNull(emailTokens.usedAt)),
      );
    await tx.insert(emailTokens).values({
      userId,
      purpose,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + TOKEN_HOURS[purpose] * 3_600_000),
    });
  });
  return token;
}

export const createVerificationToken = (db: DB, userId: number, now = new Date()) =>
  createEmailToken(db, userId, "verify_email", now);

export type SignupOutcome =
  | { kind: "created" | "unverified"; userId: number; email: string } // send (another) verification email
  | { kind: "registered"; email: string } // a confirmed account: send "you already have an account"
  | { kind: "taken" }; // the owner's username (or a lost race): send nothing

/** Creates an unverified account, or updates the password of one that was never confirmed. */
export async function signUp(db: DB, email: string, password: string): Promise<SignupOutcome> {
  const [existing] = await db.select().from(users).where(eq(users.username, email));
  // Confirmed accounts and the owner's row (no password in the DB) can't be taken over by signing up again.
  if (existing?.emailVerifiedAt && existing.passwordHash) return { kind: "registered", email };
  if (existing && (existing.emailVerifiedAt || !existing.passwordHash)) return { kind: "taken" };
  const passwordHash = await hashPassword(password);
  if (existing) {
    await db.update(users).set({ passwordHash }).where(eq(users.id, existing.id));
    return { kind: "unverified", userId: existing.id, email };
  }
  const [row] = await db
    .insert(users)
    .values({ username: email, passwordHash })
    .onConflictDoNothing()
    .returning({ id: users.id });
  if (!row) return { kind: "taken" }; // lost a race with another signup for the same email
  return { kind: "created", userId: row.id, email };
}

const validToken = (token: string, purpose: TokenPurpose, now: Date) =>
  and(
    eq(emailTokens.tokenHash, hashToken(token)),
    eq(emailTokens.purpose, purpose),
    isNull(emailTokens.usedAt),
    gt(emailTokens.expiresAt, now),
  );

/** The account behind a link that is still usable (without using it up), or null. */
export async function peekEmailToken(
  db: DB,
  token: string,
  purpose: TokenPurpose,
  now = new Date(),
): Promise<{ email: string } | null> {
  if (!token || token.length > 100) return null;
  const [row] = await db
    .select({ email: users.username })
    .from(emailTokens)
    .innerJoin(users, eq(users.id, emailTokens.userId))
    .where(validToken(token, purpose, now));
  return row ?? null;
}

export type CompleteResult =
  { ok: true; email: string } | { ok: false; reason: "invalid" | "wrong_password" };

/**
 * Uses a link up. With `newPassword` the account gets that password (reset, or "choose a new one" on
 * the confirm page); with `currentPassword` it must match the one chosen at sign-up. Either way the
 * email counts as confirmed afterwards (the person proved they read that inbox).
 */
export async function completeEmailToken(
  db: DB,
  token: string,
  purpose: TokenPurpose,
  password: { newPassword: string } | { currentPassword: string },
  now = new Date(),
): Promise<CompleteResult> {
  if (!token || token.length > 100) return { ok: false, reason: "invalid" };
  const newHash = "newPassword" in password ? await hashPassword(password.newPassword) : null;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: emailTokens.id,
        userId: emailTokens.userId,
        email: users.username,
        passwordHash: users.passwordHash,
        verifiedAt: users.emailVerifiedAt,
      })
      .from(emailTokens)
      .innerJoin(users, eq(users.id, emailTokens.userId))
      .where(validToken(token, purpose, now))
      .for("update");
    if (!row) return { ok: false as const, reason: "invalid" as const };
    if ("currentPassword" in password) {
      const matches = row.passwordHash
        ? await verifyPassword(password.currentPassword, row.passwordHash)
        : false;
      if (!matches) return { ok: false as const, reason: "wrong_password" as const };
    }
    // Spend this link and any other open link of either kind for the account.
    await tx
      .update(emailTokens)
      .set({ usedAt: now })
      .where(and(eq(emailTokens.userId, row.userId), isNull(emailTokens.usedAt)));
    await tx
      .update(users)
      .set({
        emailVerifiedAt: row.verifiedAt ?? now,
        ...(newHash ? { passwordHash: newHash } : {}),
      })
      .where(eq(users.id, row.userId));
    return { ok: true as const, email: row.email };
  });
}

/**
 * For "forgot password": a confirmed member gets a reset link, an unconfirmed one the confirmation
 * link again (which also lets them choose a new password). Anyone else: null (nothing is sent).
 */
export async function passwordHelpFor(
  db: DB,
  email: string,
): Promise<{ userId: number; email: string; kind: "reset" | "confirm" } | null> {
  const normalized = normalizeEmail(email);
  if (!EMAIL_RE.test(normalized)) return null;
  const [row] = await db
    .select({ id: users.id, verified: users.emailVerifiedAt, hash: users.passwordHash })
    .from(users)
    .where(eq(users.username, normalized));
  if (!row?.hash) return null; // unknown, or the owner's row (its password lives in .env)
  return { userId: row.id, email: normalized, kind: row.verified ? "reset" : "confirm" };
}

/** For "send the link again": the account id if this email belongs to an unconfirmed signup. */
export async function unverifiedMemberId(db: DB, email: string): Promise<number | null> {
  const [row] = await db
    .select({ id: users.id, verified: users.emailVerifiedAt, hash: users.passwordHash })
    .from(users)
    .where(eq(users.username, normalizeEmail(email)));
  return row && row.hash && !row.verified ? row.id : null;
}

export const memberLookup =
  (db: DB): MemberLookup =>
  async (email) => {
    const [row] = await db.select().from(users).where(eq(users.username, email));
    if (!row?.passwordHash) return null;
    return { username: row.username, passwordHash: row.passwordHash, verified: row.emailVerifiedAt !== null };
  };
