import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless dashboard session: `base64url(payload).base64url(HMAC-SHA256(payload, SESSION_SECRET))`,
 * stored in an httpOnly cookie. No DB table: rotating SESSION_SECRET logs every session out.
 * Pure functions (no Next.js imports) so they run in the proxy, server actions and tests alike.
 */

export const SESSION_COOKIE = "tp_session";

/** owner = DASHBOARD_USER from .env (everything); member = an account created on /signup. */
export type Role = "owner" | "member";

export type Session = { user: string; exp: number; role: Role }; // exp = unix seconds

const sign = (data: string, secret: string) => createHmac("sha256", secret).update(data).digest("base64url");

export function signSession(session: Session, secret: string): string {
  const data = Buffer.from(JSON.stringify({ u: session.user, exp: session.exp, r: session.role })).toString(
    "base64url",
  );
  return `${data}.${sign(data, secret)}`;
}

/** Returns the session when the signature is valid and it has not expired, otherwise null. */
export function verifySession(
  token: string | undefined,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): Session | null {
  if (!token) return null;
  const [data, mac, extra] = token.split(".");
  if (!data || !mac || extra !== undefined) return null;
  const expected = Buffer.from(sign(data, secret));
  const given = Buffer.from(mac);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const { u, exp, r } = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as {
      u?: unknown;
      exp?: unknown;
      r?: unknown;
    };
    if (typeof u !== "string" || typeof exp !== "number" || exp <= nowSec) return null;
    // Cookies from before roles existed could only belong to the owner.
    return { user: u, exp, role: r === "member" ? "member" : "owner" };
  } catch {
    return null;
  }
}

/** Only same-site paths are allowed as the post-login target (no `//evil.com`, no absolute URLs). */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/pool";
  }
  return next;
}
