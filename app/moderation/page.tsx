import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOwner } from "@/lib/auth/server";
import { listReports } from "@/lib/data/moderation";
import { getDb } from "@/lib/db/client";
import type { ReportStatus } from "@/lib/db/schema";
import { relativeTime } from "@/lib/utils";
import { dismissReportAction, hideCommentAction, restoreCommentAction, setBannedAction } from "./actions";

/** Reports from the Surfaced app. A comment with 3 open reports is hidden until you decide here. */
export default async function ModerationPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireOwner();
  const { status: raw } = await searchParams;
  const status: ReportStatus | "all" = raw === "all" || raw === "actioned" || raw === "dismissed" ? raw : "open";
  const reports = await listReports(getDb(), status);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Moderation</h1>
        <p className="text-sm text-muted-foreground">
          Reports from the app. Comments with 3 open reports are hidden automatically until you hide or restore
          them. Banned users can still read but can&apos;t comment or react.
        </p>
      </div>
      <nav className="flex gap-3 text-sm">
        {(["open", "actioned", "dismissed", "all"] as const).map((s) => (
          <Link
            key={s}
            href={s === "open" ? "/moderation" : `/moderation?status=${s}`}
            className={s === status ? "font-semibold underline" : "text-muted-foreground hover:underline"}>
            {s}
          </Link>
        ))}
      </nav>
      {reports.length === 0 ? (
        <p className="text-muted-foreground">Nothing here.</p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reported</TableHead>
                <TableHead>What</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Author</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((r) => (
                <TableRow key={r.id} className={r.status === "open" ? "" : "opacity-60"}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {relativeTime(r.createdAt)}
                    <div className="text-xs text-muted-foreground">by {r.reporter}</div>
                  </TableCell>
                  <TableCell className="max-w-md text-sm">
                    <span className="text-xs uppercase text-muted-foreground">{r.targetType}</span>
                    {r.commentStatus && r.commentStatus !== "visible" && (
                      <span className="ml-2 text-xs text-muted-foreground">({r.commentStatus})</span>
                    )}
                    <div className="line-clamp-3">{r.preview ?? "—"}</div>
                  </TableCell>
                  <TableCell className="text-sm">{r.reason}</TableCell>
                  <TableCell className="text-sm">
                    {r.authorName ?? "—"}
                    {r.authorBanned && <div className="text-xs text-destructive">banned</div>}
                  </TableCell>
                  <TableCell className="space-y-1 text-right">
                    {r.status === "open" && r.targetType === "comment" && r.commentStatus === "visible" && (
                      <form action={hideCommentAction}>
                        <input type="hidden" name="reportId" value={r.id} />
                        <input type="hidden" name="commentId" value={r.targetId} />
                        <Button type="submit" size="xs" variant="destructive">
                          Hide comment
                        </Button>
                      </form>
                    )}
                    {r.targetType === "comment" && r.commentStatus === "hidden" && (
                      <form action={restoreCommentAction}>
                        <input type="hidden" name="reportId" value={r.id} />
                        <input type="hidden" name="commentId" value={r.targetId} />
                        <Button type="submit" size="xs" variant="outline">
                          Restore
                        </Button>
                      </form>
                    )}
                    {r.authorId != null && (
                      <form action={setBannedAction}>
                        <input type="hidden" name="reportId" value={r.id} />
                        <input type="hidden" name="userId" value={r.authorId} />
                        <input type="hidden" name="banned" value={r.authorBanned ? "0" : "1"} />
                        <Button type="submit" size="xs" variant="outline">
                          {r.authorBanned ? "Unban author" : "Ban author"}
                        </Button>
                      </form>
                    )}
                    {r.status === "open" && (
                      <form action={dismissReportAction}>
                        <input type="hidden" name="reportId" value={r.id} />
                        <Button type="submit" size="xs" variant="ghost">
                          Dismiss
                        </Button>
                      </form>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
