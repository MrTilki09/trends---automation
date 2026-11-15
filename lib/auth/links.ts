/**
 * The base URL put in emailed links (confirm email, reset password).
 *
 * APP_URL wins when it is a real public address. When it is empty or still points at localhost (an
 * .env copied from a dev machine), the link uses the public host the visitor came in on: Caddy and
 * Cloudflare pass it as Host / X-Forwarded-Host, so a sign-up on https://trends.example.com gets a
 * https://trends.example.com link. Requests made on the server itself keep localhost links.
 * Set APP_URL in production anyway: it doesn't depend on proxy headers at all.
 */

const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|::1|0\.0\.0\.0)$|\.localhost$/i;
// A plain host[:port]: letters, digits, dots and dashes (rejects anything that isn't a hostname).
const HOST = /^[a-z0-9.-]+(:\d{1,5})?$/i;

// Private network addresses (a phone testing against a dev machine on the same Wi-Fi). Dev servers there
// speak plain http, so a link must not be upgraded to https.
const PRIVATE_IP = /^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

const hostnameOf = (host: string) => host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
export const isLocalHost = (host: string) => LOCAL.test(hostnameOf(host));

export function emailLinkOrigin(appUrl: string | undefined, headers: Headers): string {
  const configured = appUrl?.trim().replace(/\/+$/, "");
  if (configured) {
    try {
      if (!isLocalHost(new URL(configured).host)) return configured;
    } catch {
      // not a URL: ignore it
    }
  }
  const forwarded = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded || headers.get("host")?.trim() || "";
  if (host && HOST.test(host) && !isLocalHost(host)) {
    const sentProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const proto =
      sentProto === "http" || (!sentProto && PRIVATE_IP.test(hostnameOf(host))) ? "http" : "https";
    return `${proto}://${host}`;
  }
  return configured || `http://${host && HOST.test(host) ? host : "localhost:3000"}`;
}
