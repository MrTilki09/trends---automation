import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getConfig, type AppConfig } from "@/lib/config";
import { eq } from "drizzle-orm";
import { ensureUser } from "@/lib/data/users";
import { getDb } from "@/lib/db/client";
import { users, type User } from "@/lib/db/schema";
import { isLocalRequest } from "./local";
import type { AuthSettings } from "./login";
import { SESSION_COOKIE, signSession, verifySession, type Role, type Session } from "./session";

/*
 * Server-side auth helpers for pages, layouts and server actions (they use next/headers).
 * The proxy (proxy.ts) already redirects signed-out visitors, but every page and server action checks
 * again here: server actions are plain POST endpoints and must never rely on the proxy alone.
 *
 * Roles: the owner (DASHBOARD_USER, or anyone on localhost) can do everything; members (accounts made
 * on /signup, email confirmed) can browse the Pool and use their own Saved list and Settings.
 */

export type Viewer = { user: string; via: "session" | "localhost"; role: Role };

export function authSettings(cfg: AppConfig = getConfig()): AuthSettings | null {
  if (!cfg.DASHBOARD_USER || !cfg.DASHBOARD_PASSWORD_HASH || !cfg.SESSION_SECRET) return null;
  return {
    user: cfg.DASHBOARD_USER,
    passwordHash: cfg.DASHBOARD_PASSWORD_HASH,
    secret: cfg.SESSION_SECRET,
    maxAgeDays: cfg.SESSION_MAX_AGE_DAYS,
  };
}

/** Who is looking at the dashboard, or null when signed out. */
async function currentSession(cfg: AppConfig = getConfig()): Promise<Session | null> {
  const auth = authSettings(cfg);
  return auth ? verifySession((await cookies()).get(SESSION_COOKIE)?.value, auth.secret) : null;
}

export async function getViewer(): Promise<Viewer | null> {
  const cfg = getConfig();
  const session = await currentSession(cfg);
  if (session) return { user: session.user, via: "session", role: session.role };
  if (cfg.AUTH_LOCALHOST_BYPASS && isLocalRequest(await headers())) {
    return { user: "localhost", via: "localhost", role: "owner" };
  }
  return null;
}

/** For pages: signed-out visitors go to /login. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

/** For server actions: throws when signed out (the client shows an error, nothing changes). */
export async function assertViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) throw new Error("Not signed in");
  return viewer;
}

/** For owner-only pages (Runs, Sources, API keys): members are sent to the Pool. */
export async function requireOwner(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (viewer.role !== "owner") redirect("/pool");
  return viewer;
}

/** For owner-only server actions (run now, topic status, sources, API keys). */
export async function assertOwner(): Promise<Viewer> {
  const viewer = await assertViewer();
  if (viewer.role !== "owner") throw new Error("Only the owner can do this");
  return viewer;
}

/**
 * The signed-in user's row, or null. Unlike getViewer(), localhost does NOT count: personal pages
 * (Saved, Settings) and personal data (saved topics, API keys) need a real login.
 */
export async function getSignedInUser(): Promise<User | null> {
  const session = await currentSession();
  if (!session) return null;
  if (session.role === "owner") return ensureUser(getDb(), session.user);
  // Members must still exist and be confirmed (never created from a cookie).
  const [row] = await getDb().select().from(users).where(eq(users.username, session.user));
  return row?.emailVerifiedAt ? row : null;
}

/** For personal pages: not signed in → /login, then back to `path`. */
export async function requireSignedInUser(path: string): Promise<User> {
  const user = await getSignedInUser();
  if (!user) redirect(`/login?${new URLSearchParams({ next: path })}`);
  return user;
}

/** For server actions that touch personal data. */
export async function assertSignedInUser(): Promise<User> {
  const user = await getSignedInUser();
  if (!user) throw new Error("Sign in to use this");
  return user;
}

export async function startSession(user: string, role: Role, auth: AuthSettings): Promise<void> {
  const maxAge = Math.round(auth.maxAgeDays * 86_400);
  (await cookies()).set(
    SESSION_COOKIE,
    signSession({ user, role, exp: Math.floor(Date.now() / 1000) + maxAge }, auth.secret),
    {
      httpOnly: true,
      sameSite: "lax",
      // Browsers accept Secure cookies on http://localhost too, so this also works through an SSH tunnel.
      secure: getConfig().NODE_ENV === "production",
      path: "/",
      maxAge,
    },
  );
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
