/**
 * "Is this request made on the server machine itself (http://localhost:3000)?" Such requests skip the
 * dashboard login and the API key (AUTH_LOCALHOST_BYPASS, on by default).
 *
 * Inside Docker the socket address is the Docker gateway, never 127.0.0.1, so this looks at headers:
 *  - the Host must be localhost / 127.0.0.1 / [::1], and
 *  - the request must not have come through a reverse proxy or CDN: Caddy, nginx and Cloudflare all add
 *    the visitor's public IP to X-Forwarded-For (or set CF-Connecting-IP / X-Real-IP). Next.js itself
 *    fills X-Forwarded-For with the socket address when it is missing, which is a private address here.
 * This is only safe while port 3000 is reachable from the machine itself (compose binds 127.0.0.1:3000)
 * and public traffic arrives through a proxy. Never publish port 3000 directly; see README §6.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function hostname(host: string | null): string | null {
  if (!host) return null;
  const h = host.trim().toLowerCase();
  if (h.startsWith("[")) return h.slice(0, h.indexOf("]") + 1); // [::1]:3000
  return h.split(":")[0] ?? null;
}

/** Loopback or private-network address (what the Docker bridge / local machine looks like). */
export function isPrivateAddress(ip: string): boolean {
  const a = ip
    .trim()
    .toLowerCase()
    .replace(/^::ffff:/, "");
  if (a === "::1") return true;
  if (/^(fc|fd)[0-9a-f]{2}:/.test(a) || a.startsWith("fe80:")) return true;
  const m = a.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (!m) return false;
  const [x, y] = [Number(m[1]), Number(m[2])];
  return x === 127 || x === 10 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168);
}

export function isLocalRequest(headers: Headers): boolean {
  if (!LOCAL_HOSTS.has(hostname(headers.get("host")) ?? "")) return false;
  const fwdHost = headers.get("x-forwarded-host");
  if (fwdHost && !LOCAL_HOSTS.has(hostname(fwdHost) ?? "")) return false;
  if (headers.has("cf-connecting-ip") || headers.has("x-real-ip") || headers.has("forwarded")) return false;
  const xff = headers.get("x-forwarded-for");
  if (xff && (xff.includes(",") || !isPrivateAddress(xff))) return false;
  return true;
}
