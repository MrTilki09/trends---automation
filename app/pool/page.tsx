import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { TopicActions } from "@/components/topic-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listSources } from "@/lib/data/sources";
import { listCategories, listTopics, TIME_WINDOWS, TOPIC_STATUSES, type TimeWindow } from "@/lib/data/topics";
import { getDb } from "@/lib/db/client";
import type { TopicStatus } from "@/lib/db/schema";
import { hostOf, relativeTime } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

export default async function PoolPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const status = (one(sp.status) ?? "new") as TopicStatus | "all";
  const window = (one(sp.window) ?? "72h") as TimeWindow;
  const filters = {
    status: status === "all" || TOPIC_STATUSES.includes(status) ? status : "new",
    window: window in TIME_WINDOWS ? window : "72h",
    source: one(sp.source),
    category: one(sp.category),
    q: one(sp.q),
  } as const;

  const db = getDb();
  const [topics, sources, categories] = await Promise.all([
    listTopics(db, filters),
    listSources(db),
    listCategories(db),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Pool</h1>
          <p className="text-sm text-muted-foreground">
            {topics.length} topic{topics.length === 1 ? "" : "s"}, ranked by score
          </p>
        </div>
        <form className="flex flex-wrap items-center gap-2" method="get">
          <select name="status" defaultValue={filters.status} className={selectClass} aria-label="Status">
            <option value="all">All statuses</option>
            {TOPIC_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            name="window"
            defaultValue={filters.window}
            className={selectClass}
            aria-label="Time window"
          >
            {Object.keys(TIME_WINDOWS).map((w) => (
              <option key={w} value={w}>
                Last {w}
              </option>
            ))}
          </select>
          <select
            name="source"
            defaultValue={filters.source ?? ""}
            className={selectClass}
            aria-label="Source"
          >
            <option value="">All sources</option>
            {sources.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            name="category"
            defaultValue={filters.category ?? ""}
            className={selectClass}
            aria-label="Category"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <Input name="q" defaultValue={filters.q ?? ""} placeholder="Search…" className="w-44" />
          <Button type="submit" variant="outline" size="sm">
            Filter
          </Button>
        </form>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 text-right">Score</TableHead>
              <TableHead>Topic</TableHead>
              <TableHead>Sources</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>First seen</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {topics.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No topics match. Press “Run now” to collect, or widen the filters.
                </TableCell>
              </TableRow>
            )}
            {topics.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="text-right font-mono tabular-nums">{t.score.toFixed(2)}</TableCell>
                <TableCell className="max-w-xl whitespace-normal">
                  <Link href={`/pool/${t.id}`} className="font-medium hover:underline">
                    {t.title}
                  </Link>
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    {t.canonicalUrl && (
                      <a href={t.canonicalUrl} target="_blank" rel="noreferrer" className="hover:underline">
                        {hostOf(t.canonicalUrl)} ↗
                      </a>
                    )}
                    {t.llmSummary && <span className="truncate">{t.llmSummary}</span>}
                  </div>
                </TableCell>
                <TableCell className="whitespace-normal">
                  <div className="flex max-w-56 flex-wrap gap-1">
                    {t.sources.map((s) => (
                      <Badge key={s.key} variant="outline" className="font-normal">
                        {s.name}
                      </Badge>
                    ))}
                    {t.sourceCount > 1 && (
                      <span className="text-xs text-muted-foreground">×{t.sourceCount}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  {t.category ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground" title={t.firstSeenAt.toISOString()}>
                  {relativeTime(t.firstSeenAt)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={t.status} />
                </TableCell>
                <TableCell className="text-right">
                  <TopicActions id={t.id} status={t.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
