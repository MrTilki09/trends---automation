import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { DB } from "../db/client";
import { emailTokens, users } from "../db/schema";
import type { MemberLookup } from "./login";
import { hashPassword } from "./password";

/*
 * Signup accounts ("members"): email + password, usable only after the email is confirmed with a
 * one-time link. The account's username is its lowercased email. Tokens are random (32 bytes) and
 * stored only as SHA-256; a new link replaces older unused ones.
 */

export const VERIFY_TOKEN_HOURS = 24;
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
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (input.password.length > 200) return { ok: false, error: "That password is too long." };
  if (input.password !== input.confirm) return { ok: false, error: "The passwords don't match." };
  return { ok: true, email };
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** A fresh verification token for the user (older unused ones stop working). Returns the plain token. */
export async function createVerificationToken(db: DB, userId: number, now = new Date()): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.transaction(async (tx) => {
    await tx
      .update(emailTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(emailTokens.userId, userId),
          eq(emailTokens.purpose, "verify_email"),
          isNull(emailTokens.usedAt),
        ),
      );
    await tx.insert(emailTokens).values({
      userId,
      purpose: "verify_email",
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + VERIFY_TOKEN_HOURS * 3_600_000),
    });
  });
  return token;
}

export type SignupOutcome =
  | { kind: "created" | "unverified"; userId: number; email: string } // send (another) verification email
  | { kind: "taken" }; // a confirmed account already uses this email: send nothing

/** Creates an unverified account, or updates the password of one that was never confirmed. */
export async function signUp(db: DB, email: string, password: string): Promise<SignupOutcome> {
  const [existing] = await db.select().from(users).where(eq(users.username, email));
  // Confirmed accounts and the owner's row (no password in the DB) can't be taken over by signing up again.
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

/** Marks the email confirmed when the token is valid, unused and not expired. */
export async function verifyEmailToken(
  db: DB,
  token: string,
  now = new Date(),
): Promise<{ ok: true; email: string } | { ok: false }> {
  if (!token || token.length > 100) return { ok: false };
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: emailTokens.id, userId: emailTokens.userId, email: users.username })
      .from(emailTokens)
      .innerJoin(users, eq(users.id, emailTokens.userId))
      .where(
        and(
          eq(emailTokens.tokenHash, hashToken(token)),
          eq(emailTokens.purpose, "verify_email"),
          isNull(emailTokens.usedAt),
          gt(emailTokens.expiresAt, now),
        ),
      );
    if (!row) return { ok: false as const };
    await tx.update(emailTokens).set({ usedAt: now }).where(eq(emailTokens.id, row.id));
    await tx.update(users).set({ emailVerifiedAt: now }).where(eq(users.id, row.userId));
    return { ok: true as const, email: row.email };
  });
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
