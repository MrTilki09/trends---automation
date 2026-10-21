import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { apiKeyFromHeaders, generateApiKey, hashApiKey } from "../lib/data/api-keys";
import { isLocalRequest, isPrivateAddress } from "../lib/auth/local";
import { validateSignup } from "../lib/auth/accounts";
import { checkLogin, createLoginLimiter, type AuthSettings, type MemberLookup } from "../lib/auth/login";
import { hashPassword, verifyPassword } from "../lib/auth/password";
import { safeNextPath, signSession, verifySession } from "../lib/auth/session";

const SECRET = "x".repeat(32);

describe("session cookie", () => {
  const now = 1_800_000_000;

  it("verifies its own signature and returns the session", () => {
    const token = signSession({ user: "admin", exp: now + 60, role: "owner" }, SECRET);
    expect(verifySession(token, SECRET, now)).toEqual({ user: "admin", exp: now + 60, role: "owner" });
    const member = signSession({ user: "a@b.co", exp: now + 60, role: "member" }, SECRET);
    expect(verifySession(member, SECRET, now)?.role).toBe("member");
  });

  it("can't be turned into an owner session by editing the role", () => {
    const token = signSession({ user: "a@b.co", exp: now + 60, role: "member" }, SECRET);
    const [, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "a@b.co", exp: now + 60, r: "owner" })).toString(
      "base64url",
    );
    expect(verifySession(`${forged}.${mac}`, SECRET, now)).toBeNull();
  });

  it("rejects expired, tampered, wrong-secret and malformed tokens", () => {
    const token = signSession({ user: "admin", exp: now + 60, role: "owner" }, SECRET);
    expect(verifySession(token, SECRET, now + 60)).toBeNull();
    expect(verifySession(token, "y".repeat(32), now)).toBeNull();
    const [, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "admin", exp: now + 99_999 })).toString("base64url");
    expect(verifySession(`${forged}.${mac}`, SECRET, now)).toBeNull();
    expect(verifySession(`${token}.x`, SECRET, now)).toBeNull();
    expect(verifySession("garbage", SECRET, now)).toBeNull();
    expect(verifySession(undefined, SECRET, now)).toBeNull();
  });

  it("only redirects to same-site paths after login", () => {
    expect(safeNextPath("/pool?status=all")).toBe("/pool?status=all");
    expect(safeNextPath("//evil.com")).toBe("/pool");
    expect(safeNextPath("/\\evil.com")).toBe("/pool");
    expect(safeNextPath("https://evil.com")).toBe("/pool");
    expect(safeNextPath(null)).toBe("/pool");
  });
});

describe("password hash", () => {
  it("verifies the right password only", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^scrypt\.[\w-]+\.[\w-]+$/);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
  });

  it("accepts hashes made by scripts/hash-password.mjs", async () => {
    const script = path.resolve(import.meta.dirname, "../scripts/hash-password.mjs");
    const hash = execFileSync(process.execPath, [script, "a long test password"], {
      encoding: "utf8",
    }).trim();
    expect(await verifyPassword("a long test password", hash)).toBe(true);
  });
});

describe("login", () => {
  const settings = async (): Promise<AuthSettings> => ({
    user: "admin",
    passwordHash: await hashPassword("right password"),
    secret: SECRET,
    maxAgeDays: 30,
  });
  const noMembers: MemberLookup = async () => null;

  it("accepts the owner's credentials and rejects wrong ones", async () => {
    const auth = await settings();
    const limiter = createLoginLimiter();
    const ok = { user: "admin", password: "right password", ip: "1.1.1.1" };
    expect(await checkLogin(ok, auth, noMembers, limiter)).toEqual({
      ok: true,
      user: "admin",
      role: "owner",
    });
    expect(await checkLogin({ ...ok, password: "nope" }, auth, noMembers, limiter)).toMatchObject({
      ok: false,
    });
    expect(await checkLogin({ ...ok, user: "root" }, auth, noMembers, limiter)).toMatchObject({ ok: false });
  });

  it("signs in members by email only after they confirmed it", async () => {
    const auth = await settings();
    const passwordHash = await hashPassword("member password");
    const accounts: Record<string, { verified: boolean }> = {
      "new@example.com": { verified: false },
      "done@example.com": { verified: true },
    };
    const lookup: MemberLookup = async (email) =>
      accounts[email] ? { username: email, passwordHash, verified: accounts[email].verified } : null;
    const limiter = createLoginLimiter();
    const login = (user: string, password = "member password") =>
      checkLogin({ user, password, ip: "2.2.2.2" }, auth, lookup, limiter);

    expect(await login("Done@Example.com ")).toEqual({ ok: true, user: "done@example.com", role: "member" });
    expect(await login("new@example.com")).toMatchObject({ ok: false, unverified: true });
    // A wrong password never reveals whether the account is confirmed.
    expect(await login("new@example.com", "wrong password")).toEqual({
      ok: false,
      error: "Wrong email or password.",
    });
    expect(await login("nobody@example.com")).toEqual({ ok: false, error: "Wrong email or password." });
  });

  it("refuses everyone when login is not configured", async () => {
    const r = await checkLogin(
      { user: "admin", password: "x", ip: "1.1.1.1" },
      null,
      noMembers,
      createLoginLimiter(),
    );
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("not configured") });
  });

  it("rate-limits attempts per IP: 5 at once, then 1 per minute", async () => {
    const auth = await settings();
    let t = 0;
    const limiter = createLoginLimiter(() => t);
    const attempt = (ip: string, password = "guess") =>
      checkLogin({ user: "admin", password, ip }, auth, noMembers, limiter);
    const owner = { ok: true, user: "admin", role: "owner" };

    for (let i = 0; i < 5; i++) expect((await attempt("6.6.6.6")).ok).toBe(false);
    // 6th attempt is blocked even with the right password.
    const blocked = await attempt("6.6.6.6", "right password");
    expect(blocked).toMatchObject({ ok: false, retryAfterSec: 60 });
    // Other IPs are unaffected.
    expect(await attempt("7.7.7.7", "right password")).toEqual(owner);
    // One minute later, one more try.
    t += 60_000;
    expect(await attempt("6.6.6.6", "right password")).toEqual(owner);
    expect(await attempt("6.6.6.6", "right password")).toMatchObject({ ok: false, retryAfterSec: 60 });
  });
});

describe("signup validation", () => {
  const good = { email: " Me@Example.COM ", password: "long enough pw", confirm: "long enough pw" };

  it("normalizes the email", () => {
    expect(validateSignup(good)).toEqual({ ok: true, email: "me@example.com" });
  });

  it("rejects bad emails, short or mismatched passwords", () => {
    expect(validateSignup({ ...good, email: "not-an-email" })).toMatchObject({ ok: false });
    expect(validateSignup({ ...good, email: "a@b" })).toMatchObject({ ok: false });
    expect(validateSignup({ ...good, password: "short", confirm: "short" })).toMatchObject({ ok: false });
    expect(validateSignup({ ...good, confirm: "different pw" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("match"),
    });
  });
});

describe("localhost bypass", () => {
  const h = (init: Record<string, string>) => new Headers(init);

  it("treats direct requests to localhost as local", () => {
    expect(isLocalRequest(h({ host: "localhost:3000" }))).toBe(true);
    expect(isLocalRequest(h({ host: "127.0.0.1:3000", "x-forwarded-for": "172.18.0.1" }))).toBe(true);
    expect(isLocalRequest(h({ host: "[::1]:3000", "x-forwarded-for": "::1" }))).toBe(true);
  });

  it("does not trust a spoofed Host that came through a proxy or CDN", () => {
    expect(isLocalRequest(h({ host: "trends.example.com" }))).toBe(false);
    expect(isLocalRequest(h({ host: "localhost", "x-forwarded-for": "203.0.113.9" }))).toBe(false);
    expect(isLocalRequest(h({ host: "localhost", "x-forwarded-for": "127.0.0.1, 203.0.113.9" }))).toBe(false);
    expect(isLocalRequest(h({ host: "localhost", "cf-connecting-ip": "203.0.113.9" }))).toBe(false);
    expect(isLocalRequest(h({ host: "localhost", "x-real-ip": "203.0.113.9" }))).toBe(false);
    expect(isLocalRequest(h({ host: "localhost", "x-forwarded-host": "trends.example.com" }))).toBe(false);
  });

  it("knows private addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.17.0.1",
      "192.168.65.1",
      "::1",
      "::ffff:127.0.0.1",
      "fd00::1",
    ]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    for (const ip of ["8.8.8.8", "172.32.0.1", "2001:db8::1", "unknown"])
      expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe("API keys", () => {
  it("generates long random keys and stores only a hash", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).toMatch(/^tp_[\w-]{43}$/);
    expect(a.key).not.toBe(b.key);
    expect(a.keyHash).toBe(hashApiKey(a.key));
    expect(a.keyHash).not.toContain(a.key);
    expect(a.key.startsWith(a.prefix)).toBe(true);
  });

  it("reads the key from Authorization: Bearer or X-API-Key", () => {
    expect(apiKeyFromHeaders(new Headers({ authorization: "Bearer tp_abc" }))).toBe("tp_abc");
    expect(apiKeyFromHeaders(new Headers({ "x-api-key": " tp_abc " }))).toBe("tp_abc");
    expect(apiKeyFromHeaders(new Headers({ authorization: "Basic xyz" }))).toBeNull();
    expect(apiKeyFromHeaders(new Headers())).toBeNull();
  });
});
