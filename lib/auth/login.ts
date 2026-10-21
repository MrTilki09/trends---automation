import { timingSafeEqual } from "node:crypto";
import { RateLimiter } from "@/lib/util/rate-limit";
import { verifyPassword } from "./password";

export type AuthSettings = { user: string; passwordHash: string; secret: string; maxAgeDays: number };

export type LoginResult = { ok: true } | { ok: false; error: string; retryAfterSec?: number };

/** Per IP: 5 attempts at once, then 1 more per minute. Per process, like the API limiter. */
export const createLoginLimiter = (now?: () => number) => new RateLimiter(5, 1 / 60, 10_000, now);
const loginLimiter = createLoginLimiter();

const sameString = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Checks one login attempt. Every attempt (right or wrong) costs a token, so guessing is slow. */
export async function checkLogin(
  input: { user: string; password: string; ip: string },
  auth: AuthSettings | null,
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
  if (!auth) return { ok: false, error: "Login is not configured on this server (see README §6)." };
  // Always run the (slow) password check so a wrong username takes as long as a wrong password.
  const passwordOk = await verifyPassword(input.password, auth.passwordHash);
  if (!sameString(input.user, auth.user) || !passwordOk)
    return { ok: false, error: "Wrong username or password." };
  return { ok: true };
}
