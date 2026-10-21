import { NextResponse, type NextRequest } from "next/server";
import { authSettings } from "@/lib/auth/server";
import { isLocalRequest } from "@/lib/auth/local";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { getConfig } from "@/lib/config";

/*
 * Next.js 16 Proxy (formerly Middleware; Node.js runtime): signed-out visitors of the dashboard are
 * sent to /login. This is the first gate only; pages and server actions check again (lib/auth/server.ts).
 * /api/* is skipped here: /api/topics checks its own API key (and answers JSON, not a redirect).
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/")) return NextResponse.next();

  const cfg = getConfig();
  if (cfg.AUTH_LOCALHOST_BYPASS && isLocalRequest(req.headers)) return NextResponse.next();
  const auth = authSettings(cfg);
  if (auth && verifySession(req.cookies.get(SESSION_COOKIE)?.value, auth.secret)) return NextResponse.next();

  if (req.method !== "GET" && req.method !== "HEAD") {
    return new NextResponse("Not signed in", { status: 401 });
  }
  // req.url carries the server's own host (localhost:3000), not the domain the visitor used: rebuild it from
  // the Host / X-Forwarded-* headers (set by Caddy, and by Next.js itself when missing).
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "http";
  const login = new URL(`${proto}://${host}/login`);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except build assets and static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)"],
};
