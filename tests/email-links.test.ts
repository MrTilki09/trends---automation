import { describe, expect, it } from "vitest";
import { validateNewPassword } from "../lib/auth/accounts";
import { appUrlMismatch, emailLinkOrigin } from "../lib/auth/links";
import { alreadyRegisteredMail, resetPasswordMail, verificationMail } from "../lib/mail";

const h = (init: Record<string, string>) => new Headers(init);
const PUBLIC = "https://trend.developerfox.com.tr";

describe("origin of emailed links", () => {
  it("uses APP_URL when it is a public address", () => {
    expect(emailLinkOrigin(`${PUBLIC}/`, h({ host: "localhost:3000" }))).toBe(PUBLIC);
  });

  it("never sends a localhost link to someone who signed up on the public site", () => {
    // APP_URL copied from a dev .env, the visitor came through Caddy / Cloudflare.
    const viaProxy = h({
      host: "localhost:3000",
      "x-forwarded-host": "trend.developerfox.com.tr",
      "x-forwarded-proto": "https",
    });
    expect(emailLinkOrigin("http://localhost:3000", viaProxy)).toBe(PUBLIC);
    expect(emailLinkOrigin(undefined, viaProxy)).toBe(PUBLIC);
    // Proxy that keeps the public Host header; https unless the proxy says http.
    expect(emailLinkOrigin("", h({ host: "trend.developerfox.com.tr" }))).toBe(PUBLIC);
  });

  it("keeps localhost links for local testing", () => {
    expect(emailLinkOrigin("http://localhost:3000", h({ host: "localhost:3000" }))).toBe(
      "http://localhost:3000",
    );
    expect(emailLinkOrigin(undefined, h({ host: "localhost:3000" }))).toBe("http://localhost:3000");
  });

  it("uses plain http for a dev machine on the local network (phone on the same Wi-Fi)", () => {
    expect(emailLinkOrigin("http://localhost:3000", h({ host: "192.168.1.86:3100" }))).toBe(
      "http://192.168.1.86:3100",
    );
    // …but a proxy's own answer wins.
    expect(emailLinkOrigin(undefined, h({ host: "10.0.0.5", "x-forwarded-proto": "https" }))).toBe("https://10.0.0.5");
  });

  it("ignores a Host header that isn't a hostname", () => {
    expect(emailLinkOrigin(undefined, h({ host: "evil.com/path?x=" }))).toBe("http://localhost:3000");
  });
});

describe("APP_URL sanity check", () => {
  it("flags an APP_URL whose host isn't the one visitors use", () => {
    const viaProxy = h({ host: "localhost:3000", "x-forwarded-host": "trend.developerfox.com.tr" });
    expect(appUrlMismatch("https://trends.developerfox.com.tr", viaProxy)).toBe("trend.developerfox.com.tr");
    expect(appUrlMismatch(PUBLIC, viaProxy)).toBeNull();
  });
  it("stays quiet for local requests and when APP_URL is unset", () => {
    expect(appUrlMismatch(PUBLIC, h({ host: "localhost:3000" }))).toBeNull();
    expect(appUrlMismatch(PUBLIC, h({ host: "192.168.1.86:3100" }))).toBeNull();
    expect(appUrlMismatch(undefined, h({ host: "trend.developerfox.com.tr" }))).toBeNull();
  });
});

describe("account emails", () => {
  it("confirmation and reset emails carry their link", () => {
    const v = verificationMail("me@example.com", `${PUBLIC}/verify?token=abc`, "Trend Pool");
    expect(v.text).toContain(`${PUBLIC}/verify?token=abc`);
    expect(v.html).toContain(`href="${PUBLIC}/verify?token=abc"`);
    const r = resetPasswordMail("me@example.com", `${PUBLIC}/reset?token=xyz`, "Trend Pool");
    expect(r.subject).toBe("Reset your Trend Pool password");
    expect(r.text).toContain("1 hour");
    expect(r.html).toContain(`href="${PUBLIC}/reset?token=xyz"`);
  });

  it("an existing account gets 'you already have an account' with sign-in and reset links", () => {
    const m = alreadyRegisteredMail("me@example.com", PUBLIC, "Trend Pool");
    expect(m.subject).toBe("You already have a Trend Pool account");
    expect(m.text).toContain(`${PUBLIC}/login`);
    expect(m.text).toContain(`${PUBLIC}/forgot`);
    expect(m.text).not.toContain("token");
  });

  it("new passwords must be long enough and repeated correctly", () => {
    expect(validateNewPassword("long enough pw", "long enough pw")).toEqual({ ok: true });
    expect(validateNewPassword("short", "short")).toMatchObject({ ok: false });
    expect(validateNewPassword("long enough pw", "long enough px")).toMatchObject({ ok: false });
  });
});
