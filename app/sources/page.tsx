import { toggleSourceAction } from "@/app/actions";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireViewer } from "@/lib/auth/server";
import { listSources } from "@/lib/data/sources";
import { getDb } from "@/lib/db/client";
import { relativeTime } from "@/lib/utils";

export default async function SourcesPage() {
  await requireViewer();
  const sources = await listSources(getDb());
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Sources</h1>
        <p className="text-sm text-muted-foreground">
          Edit <code>config/sources.seed.ts</code> and run <code>npm run db:reseed</code> to change configs.
          The toggle here decides which sources the next run uses.
        </p>
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Enabled</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Weight</TableHead>
              <TableHead>Last success</TableHead>
              <TableHead>Last error</TableHead>
              <TableHead>Config</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.map((s) => (
              <TableRow key={s.id} className={s.enabled ? "" : "opacity-60"}>
                <TableCell>
                  <form action={toggleSourceAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="enabled" value={String(!s.enabled)} />
                    <Button
                      type="submit"
                      size="xs"
                      variant={s.enabled ? "default" : "outline"}
                      className="w-14"
                    >
                      {s.enabled ? "On" : "Off"}
                    </Button>
                  </form>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{s.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{s.key}</div>
                </TableCell>
                <TableCell className="font-mono text-xs">{s.type}</TableCell>
                <TableCell className="text-right tabular-nums">{s.weight}</TableCell>
                <TableCell className="text-sm">
                  {s.lastSuccessAt ? (
                    relativeTime(s.lastSuccessAt)
                  ) : (
                    <span className="text-muted-foreground">never</span>
                  )}
                </TableCell>
                <TableCell className="max-w-xs whitespace-normal text-xs">
                  {!s.enabled ? (
                    <span className="text-muted-foreground">Off — not collected</span>
                  ) : s.lastError ? (
                    <span className="text-red-600 dark:text-red-400">{s.lastError}</span>
                  ) : s.lastSuccessAt ? (
                    <StatusBadge status="succeeded" />
                  ) : null}
                </TableCell>
                <TableCell>
                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground">show</summary>
                    <pre className="mt-1 max-w-sm overflow-x-auto rounded bg-muted p-2 text-xs">
                      {JSON.stringify(s.config, null, 2)}
                    </pre>
                  </details>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
