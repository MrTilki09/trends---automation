import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { RunNowButton } from "@/components/run-now-button";
import { StatusBadge } from "@/components/status-badge";
import { getViewer, type Viewer } from "@/lib/auth/server";
import { hasActiveCollect } from "@/lib/data/jobs";
import { latestRun } from "@/lib/data/runs";
import { readHeartbeat } from "@/lib/data/settings";
import { getDb } from "@/lib/db/client";
import { relativeTime } from "@/lib/utils";
import "./globals.css";

// Every page reads live data from Postgres: never pre-render at build time.
export const dynamic = "force-dynamic";

const DESCRIPTION =
  "Free, live-ranked tech news: stories from 45+ sources, de-duplicated and ranked by how much they're trending. Filter, search and export.";

// Title/description also used for the link preview when the page is shared (LinkedIn, X, Slack...).
export const metadata: Metadata = {
  title: "Trend Pool · Live-ranked tech news",
  description: DESCRIPTION,
  openGraph: {
    title: "Trend Pool · Live-ranked tech news",
    description: DESCRIPTION,
    type: "website",
    siteName: "Trend Pool",
  },
  twitter: { card: "summary", title: "Trend Pool · Live-ranked tech news", description: DESCRIPTION },
};

const NAV = [{ href: "/pool", label: "Pool" }];
// Owner only (members get redirected to the Pool).
const OWNER_NAV = [
  { href: "/runs", label: "Runs" },
  { href: "/sources", label: "Sources" },
  { href: "/keys", label: "API keys" },
];
// Personal pages: only with a real login (not via the localhost bypass).
const USER_NAV = [
  { href: "/saved", label: "Saved" },
  { href: "/settings", label: "Settings" },
  { href: "/profile", label: "Profile" },
];

async function Header({ viewer }: { viewer: Viewer }) {
  const db = getDb();
  const [{ online, heartbeat }, run, active] = await Promise.all([
    readHeartbeat(db),
    latestRun(db),
    hasActiveCollect(db),
  ]);
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/pool" className="font-semibold tracking-tight">
          Trend Pool
        </Link>
        <nav className="flex gap-4 text-sm">
          {[
            ...NAV,
            ...(viewer.role === "owner" ? OWNER_NAV : []),
            ...(viewer.via === "session" ? USER_NAV : []),
          ].map((n) => (
            <Link key={n.href} href={n.href} className="text-muted-foreground hover:text-foreground">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
          <span
            className="flex items-center gap-1.5"
            title={heartbeat ? `Last heartbeat ${heartbeat.at}` : "No heartbeat yet"}
          >
            Worker <StatusBadge status={online ? "online" : "offline"} />
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            Last run:
            {run ? (
              <>
                <Link href="/runs" className="hover:underline">
                  {relativeTime(run.startedAt)}
                </Link>
                <StatusBadge status={run.status} />
              </>
            ) : (
              " never"
            )}
          </span>
          {viewer.role === "owner" && <RunNowButton active={active} />}
          {viewer.via === "session" ? (
            <form action={logoutAction}>
              <button
                type="submit"
                className="text-muted-foreground hover:text-foreground"
                title={`Signed in as ${viewer.user}`}
              >
                Log out
              </button>
            </form>
          ) : (
            <Link
              href="/login"
              className="text-muted-foreground hover:text-foreground"
              title="On localhost the dashboard works without a login; sign in for Saved and Settings"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

/** Header for signed-out visitors of the public home page: no run controls, just sign in / sign up. */
async function PublicHeader() {
  const run = await latestRun(getDb());
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/pool" className="font-semibold tracking-tight">
          Trend Pool
        </Link>
        {run && (
          <span className="text-sm text-muted-foreground" title={run.startedAt.toISOString()}>
            Updated {relativeTime(run.startedAt)}
          </span>
        )}
        <div className="ml-auto flex items-center gap-3 text-sm">
          <Link href="/login" className="text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:bg-primary/90"
          >
            Sign up free
          </Link>
        </div>
      </div>
    </header>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  return (
    <html lang="en">
      <body className="min-h-screen">
        {viewer ? <Header viewer={viewer} /> : <PublicHeader />}
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
