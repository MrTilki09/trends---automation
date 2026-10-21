import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireViewer } from "@/lib/auth/server";
import { listRuns } from "@/lib/data/runs";
import { getDb } from "@/lib/db/client";
import { formatDateTime, formatDuration } from "@/lib/utils";

export default async function RunsPage() {
  await requireViewer();
  const runs = await listRuns(getDb(), 50);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Runs</h1>
        <p className="text-sm text-muted-foreground">
          Last 50 collection runs. Click a run to see each source.
        </p>
      </div>
      {runs.length === 0 && <p className="text-muted-foreground">No runs yet. Press “Run now”.</p>}
      <div className="space-y-2">
        {runs.map((run) => {
          const s = run.stats;
          const duration = run.finishedAt ? run.finishedAt.getTime() - run.startedAt.getTime() : null;
          const failed = run.sources.filter((x) => x.status === "failed").length;
          return (
            <details key={run.id} className="group rounded-lg border">
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <span className="font-mono text-muted-foreground">#{run.id}</span>
                <StatusBadge status={run.status} />
                <span>{formatDateTime(run.startedAt)}</span>
                <span className="text-muted-foreground">{run.trigger}</span>
                <span className="text-muted-foreground">{formatDuration(duration)}</span>
                <span>
                  {s.itemsFetched ?? 0} fetched · <b>{s.itemsNew ?? 0} new</b>
                </span>
                <span className="text-muted-foreground">
                  {s.topicsCreated ?? 0} new topics · {s.topicsScored ?? 0} scored
                </span>
                {failed > 0 && (
                  <span className="text-red-600 dark:text-red-400">{failed} source(s) failed</span>
                )}
                {s.llm && s.llm.status !== "disabled" && (
                  <span className="flex items-center gap-1">
                    LLM{" "}
                    <StatusBadge
                      status={
                        s.llm.status === "error"
                          ? "error"
                          : s.llm.status === "ok"
                            ? "succeeded"
                            : s.llm.status
                      }
                    />
                  </span>
                )}
              </summary>
              <div className="space-y-3 border-t px-4 py-3">
                {run.error && (
                  <p className="text-sm text-red-600 dark:text-red-400">Run error: {run.error}</p>
                )}
                {s.llm?.error && (
                  <p className="text-sm text-red-600 dark:text-red-400">LLM enrichment: {s.llm.error}</p>
                )}
                {s.stepsMs && (
                  <p className="text-xs text-muted-foreground">
                    Steps:{" "}
                    {Object.entries(s.stepsMs)
                      .map(([k, v]) => `${k} ${formatDuration(v)}`)
                      .join(" · ")}
                  </p>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Fetched</TableHead>
                      <TableHead className="text-right">New</TableHead>
                      <TableHead className="text-right">Duration</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {run.sources.map((src) => (
                      <TableRow key={src.sourceKey}>
                        <TableCell>{src.sourceName}</TableCell>
                        <TableCell>
                          <StatusBadge status={src.status} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{src.itemsFetched}</TableCell>
                        <TableCell className="text-right tabular-nums">{src.itemsNew}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatDuration(src.durationMs)}
                        </TableCell>
                        <TableCell className="max-w-md whitespace-normal text-xs text-red-600 dark:text-red-400">
                          {src.error}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
