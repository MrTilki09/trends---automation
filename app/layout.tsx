import type { Metadata } from "next";
import Link from "next/link";
import { RunNowButton } from "@/components/run-now-button";
import { StatusBadge } from "@/components/status-badge";
import { hasActiveCollect } from "@/lib/data/jobs";
import { latestRun } from "@/lib/data/runs";
import { readHeartbeat } from "@/lib/data/settings";
import { getDb } from "@/lib/db/client";
import { relativeTime } from "@/lib/utils";
import "./globals.css";

// Every page reads live data from Postgres: never pre-render at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trend Pool",
  description: "Collected and ranked trending topics",
};

const NAV = [
  { href: "/pool", label: "Pool" },
  { href: "/runs", label: "Runs" },
  { href: "/sources", label: "Sources" },
];

async function Header() {
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
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="text-muted-foreground hover:text-foreground">
              {n.label}
            </Link>
          ))}
          {/* Phase 2+: Drafts */}
          <span className="text-muted-foreground/50" title="Coming in a later phase">
            Drafts
          </span>
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
          <RunNowButton active={active} />
        </div>
      </div>
    </header>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Header />
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
