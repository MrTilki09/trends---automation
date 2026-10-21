import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Password hashes for DASHBOARD_PASSWORD_HASH: `scrypt.<salt>.<key>` (base64url, Node's built-in scrypt
 * with N=16384, r=8, p=1, 64-byte key). No `$` in the format, so the value is safe in a compose .env file.
 * Generate one with `node scripts/hash-password.mjs` (same format, kept in sync by tests/auth.test.ts).
 */

const KEY_LEN = 64;

const derive = (password: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, KEY_LEN, (err, key) => (err ? reject(err) : resolve(key))),
  );

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt.${salt.toString("base64url")}.${(await derive(password, salt)).toString("base64url")}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [algo, salt, key, extra] = hash.split(".");
  if (algo !== "scrypt" || !salt || !key || extra !== undefined) return false;
  const expected = Buffer.from(key, "base64url");
  if (expected.length !== KEY_LEN) return false;
  return timingSafeEqual(await derive(password, Buffer.from(salt, "base64url")), expected);
}
