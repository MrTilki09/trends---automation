import { revokeApiKeyAction } from "@/app/actions";
import { CreateApiKeyForm } from "@/components/create-api-key-form";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireViewer } from "@/lib/auth/server";
import { listApiKeys } from "@/lib/data/api-keys";
import { getDb } from "@/lib/db/client";
import { formatDateTime, relativeTime } from "@/lib/utils";

export default async function KeysPage() {
  await requireViewer();
  const keys = await listApiKeys(getDb());
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">API keys</h1>
        <p className="text-sm text-muted-foreground">
          Calls to <code>/api/topics</code> need a key: <code>Authorization: Bearer &lt;key&gt;</code> or{" "}
          <code>X-API-Key: &lt;key&gt;</code>. Requests on the server itself (localhost) don&apos;t.
        </p>
      </div>
      <CreateApiKeyForm />
      {keys.length === 0 ? (
        <p className="text-muted-foreground">No keys yet.</p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id} className={k.revokedAt ? "opacity-60" : ""}>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell className="font-mono text-xs">{k.prefix}…</TableCell>
                  <TableCell className="text-sm">{formatDateTime(k.createdAt)}</TableCell>
                  <TableCell className="text-sm">
                    {k.lastUsedAt ? relativeTime(k.lastUsedAt) : "never"}
                  </TableCell>
                  <TableCell className="text-right">
                    {k.revokedAt ? (
                      <span className="text-xs text-muted-foreground">
                        revoked {relativeTime(k.revokedAt)}
                      </span>
                    ) : (
                      <form action={revokeApiKeyAction}>
                        <input type="hidden" name="id" value={k.id} />
                        <Button type="submit" size="xs" variant="outline">
                          Revoke
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
