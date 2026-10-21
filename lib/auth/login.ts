import { timingSafeEqual } from "node:crypto";
import { RateLimiter } from "@/lib/util/rate-limit";
import { verifyPassword } from "./password";
import type { Role } from "./session";

export type AuthSettings = { user: string; passwordHash: string; secret: string; maxAgeDays: number };

export type LoginResult =
  | { ok: true; user: string; role: Role }
  | { ok: false; error: string; retryAfterSec?: number; unverified?: boolean };

/** A signup account as the login check needs it (null = no such account). */
export type MemberLookup = (
  email: string,
) => Promise<{ username: string; passwordHash: string; verified: boolean } | null>;

// Compared against when the account doesn't exist, so an unknown email costs as much time as a real one.
const DUMMY_HASH = `scrypt.${"A".repeat(22)}.${"A".repeat(86)}`; // 16-byte salt, 64-byte key

/** Per IP: 5 attempts at once, then 1 more per minute. Per process, like the API limiter. */
export const createLoginLimiter = (now?: () => number) => new RateLimiter(5, 1 / 60, 10_000, now);
const loginLimiter = createLoginLimiter();

const sameString = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Checks one login attempt: the owner (DASHBOARD_USER from .env) or a signup account (by email).
 * Every attempt (right or wrong) costs a rate-limit token, so guessing is slow.
 * Signup accounts must have confirmed their email first.
 */
export async function checkLogin(
  input: { user: string; password: string; ip: string },
  auth: AuthSettings | null,
  findMember: MemberLookup,
  limiter: RateLimiter = loginLimiter,
): Promise<LoginResult> {
  const rl = limiter.take(input.ip);
  if (!rl.allowed) {
    return {
      ok: false,
      error: `Too many attempts. Try again in ${rl.retryAfterSec} s.`,
      retryAfterSec: rl.retryAfterSec,
    };
  }
  const wrong = { ok: false as const, error: "Wrong email or password." };

  if (auth && sameString(input.user, auth.user)) {
    return (await verifyPassword(input.password, auth.passwordHash))
      ? { ok: true, user: auth.user, role: "owner" }
      : wrong;
  }
  if (!auth) return { ok: false, error: "Login is not configured on this server (see README §6)." };

  const member = input.user.includes("@") ? await findMember(input.user.trim().toLowerCase()) : null;
  // Always run the (slow) password check so an unknown email takes as long as a wrong password.
  const passwordOk = await verifyPassword(input.password, member?.passwordHash ?? DUMMY_HASH);
  if (!member || !passwordOk) return wrong;
  if (!member.verified) {
    return {
      ok: false,
      unverified: true,
      error: "Confirm your email first: open the link we sent you (or send a new one below).",
    };
  }
  return { ok: true, user: member.username, role: "member" };
}
