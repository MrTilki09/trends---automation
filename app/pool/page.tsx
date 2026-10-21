import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { ApiUrlBox } from "@/components/api-url-box";
import { StatusBadge } from "@/components/status-badge";
import { TopicActions } from "@/components/topic-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSignedInUser, requireViewer } from "@/lib/auth/server";
import { savedTopicIds } from "@/lib/data/saved";
import { listSources } from "@/lib/data/sources";
import { filtersToQuery, parseTopicFilters } from "@/lib/data/topic-filters";
import {
  DEFAULT_DIR,
  FOCUSES,
  listFacets,
  listTopics,
  SORTS,
  TIME_WINDOWS,
  TOPIC_STATUSES,
  type SortKey,
  type TopicFilters,
} from "@/lib/data/topics";
import { getDb } from "@/lib/db/client";
import { formatDateTime, hostOf, relativeTime } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

const LANG_NAMES: Record<string, string> = { tr: "Turkish", en: "English" };

/** Builds a /pool URL with the current filters plus `change` (undefined removes a key). */
function poolHref(current: TopicFilters, change: Partial<Record<keyof TopicFilters, string | undefined>>) {
  return `/pool?${filtersToQuery(current, change)}`;
}

/** One-click views at the top of the Pool (each sets these filters, keeping focus/status/window/sort). */
const QUICK_VIEWS: { label: string; hint: string; change: Partial<Record<keyof TopicFilters, string>> }[] = [
  { label: "All", hint: "No category or tag filter", change: {} },
  { label: "AI", hint: "Category: AI", change: { category: "AI" } },
  { label: "Launches", hint: "New products, models and releases", change: { tag: "launch" } },
  { label: "Official", hint: "Straight from company newsrooms & blogs", change: { tag: "official" } },
  { label: "Show HN", hint: "Things people just built", change: { tag: "show hn" } },
  { label: "Hardware", hint: "Category: Hardware", change: { category: "Hardware" } },
  { label: "Mobile", hint: "Category: Mobile", change: { category: "Mobile" } },
  { label: "Security", hint: "Category: Security", change: { category: "Security" } },
  { label: "Startups", hint: "Category: Startups", change: { category: "Startups" } },
  { label: "Türkiye", hint: "Turkish sources", change: { tag: "turkey" } },
];

/**
 * Clickable column header: first click sorts by this column (numbers/dates high→low, text A→Z),
 * clicking the active column again reverses the direction.
 */
function SortHead({
  col,
  label,
  filters,
  className,
  align,
}: {
  col: SortKey;
  label: string;
  filters: TopicFilters;
  className?: string;
  align?: "right";
}) {
  const active = filters.sort === col;
  const dir = filters.dir ?? DEFAULT_DIR[col];
  const nextDir = active ? (dir === "asc" ? "desc" : "asc") : DEFAULT_DIR[col];
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={className}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <Link
        href={poolHref(filters, { sort: col, dir: nextDir })}
        className={`inline-flex items-center gap-1 hover:text-foreground ${align === "right" ? "w-full justify-end" : ""} ${active ? "text-foreground" : ""}`}
        title={`Sort by ${label.toLowerCase()}`}
      >
        {label}
        <Icon className={`size-3.5 ${active ? "" : "opacity-40"}`} />
      </Link>
    </TableHead>
  );
}

/** Origin (scheme + host) of the current request, as the browser addressed it. */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function PoolPage({ searchParams }: { searchParams: SearchParams }) {
  await requireViewer();
  const filters = parseTopicFilters(await searchParams);
  const sort = filters.sort ?? "score";
  const dir = filters.dir ?? DEFAULT_DIR[sort];

  const db = getDb();
  const user = await getSignedInUser();
  const [topics, sources, facets, savedIds] = await Promise.all([
    listTopics(db, filters),
    listSources(db),
    listFacets(db, filters),
    user ? savedTopicIds(db, user.id) : null,
  ]);
  const hasExtraFilters = Boolean(
    filters.source || filters.category || filters.tag || filters.lang || filters.q,
  );

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">Pool</h1>
            <p className="text-sm text-muted-foreground">
              {topics.length} topic{topics.length === 1 ? "" : "s"}
              {filters.window !== "all" ? ` published in the last ${filters.window}` : ""}, sorted by{" "}
              {SORTS[sort].toLowerCase()} {dir === "asc" ? "↑" : "↓"}
            </p>
          </div>
          {hasExtraFilters && (
            <Link
              href={poolHref(filters, {
                source: undefined,
                category: undefined,
                tag: undefined,
                lang: undefined,
                q: undefined,
              })}
              className="text-sm text-muted-foreground hover:underline"
            >
              Clear filters
            </Link>
          )}
        </div>
        <nav className="flex flex-wrap items-center gap-1.5 text-sm" aria-label="Quick views">
          {QUICK_VIEWS.map((v) => {
            const href = poolHref(
              {
                focus: filters.focus,
                status: filters.status,
                window: filters.window,
                sort: filters.sort,
                dir: filters.dir,
              },
              v.change,
            );
            const active = filters.category === v.change.category && filters.tag === v.change.tag;
            return (
              <Link
                key={v.label}
                href={href}
                className={
                  active
                    ? "rounded-full bg-primary px-3 py-1 text-primary-foreground"
                    : "rounded-full border px-3 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                }
                title={v.hint}
              >
                {v.label}
              </Link>
            );
          })}
        </nav>
        <form className="flex flex-wrap items-center gap-2" method="get">
          <select name="focus" defaultValue={filters.focus} className={selectClass} aria-label="Focus">
            {Object.entries(FOCUSES).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <select
            // key: re-create when the sort changes (e.g. via a column header) so it shows the current value
            key={filters.sort}
            name="sort"
            defaultValue={filters.sort}
            className={selectClass}
            aria-label="Sort"
          >
            {Object.entries(SORTS)
              .filter(([k]) => k !== "newest")
              .map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
          </select>
          <select name="window" defaultValue={filters.window} className={selectClass} aria-label="Published">
            {Object.keys(TIME_WINDOWS).map((w) => (
              <option key={w} value={w}>
                {w === "all" ? "Any time" : `Published last ${w}`}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={filters.status} className={selectClass} aria-label="Status">
            <option value="all">All statuses</option>
            {TOPIC_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
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
            {facets.categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.value} ({c.count})
              </option>
            ))}
          </select>
          <select name="tag" defaultValue={filters.tag ?? ""} className={selectClass} aria-label="Tag">
            <option value="">All tags</option>
            {facets.tags.map((t) => (
              <option key={t.value} value={t.value}>
                #{t.value} ({t.count})
              </option>
            ))}
          </select>
          <select name="lang" defaultValue={filters.lang ?? ""} className={selectClass} aria-label="Language">
            <option value="">All languages</option>
            {facets.langs.map((l) => (
              <option key={l.value} value={l.value}>
                {LANG_NAMES[l.value] ?? l.value} ({l.count})
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
          <Input name="q" defaultValue={filters.q ?? ""} placeholder="Search…" className="w-44" />
          <Button type="submit" variant="outline" size="sm">
            Apply
          </Button>
        </form>
      </div>

      <ApiUrlBox query={filtersToQuery(filters)} serverOrigin={await requestOrigin()} />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead col="score" label="Score" filters={filters} className="w-20" align="right" />
              <SortHead col="title" label="Topic" filters={filters} />
              <SortHead col="sources" label="Sources" filters={filters} />
              <SortHead col="category" label="Category" filters={filters} />
              <SortHead col="published" label="Published" filters={filters} />
              <SortHead col="status" label="Status" filters={filters} />
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
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-xs text-muted-foreground">
                    {t.lang && <span className="font-mono uppercase">{t.lang}</span>}
                    {t.canonicalUrl && (
                      <a href={t.canonicalUrl} target="_blank" rel="noreferrer" className="hover:underline">
                        {hostOf(t.canonicalUrl)} ↗
                      </a>
                    )}
                    {t.tags.slice(0, 4).map((tag) => (
                      <Link
                        key={tag}
                        href={poolHref(filters, { tag })}
                        className="hover:text-foreground hover:underline"
                      >
                        #{tag}
                      </Link>
                    ))}
                  </div>
                  {t.llmSummary && <p className="pt-0.5 text-xs text-muted-foreground">{t.llmSummary}</p>}
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
                  {t.category ? (
                    <Link href={poolHref(filters, { category: t.category })}>
                      <Badge variant="secondary" className="font-normal hover:bg-secondary/60">
                        {t.category}
                      </Badge>
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell
                  className="whitespace-nowrap text-sm text-muted-foreground"
                  title={formatDateTime(t.publishedAt)}
                >
                  {relativeTime(t.publishedAt)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={t.status} />
                </TableCell>
                <TableCell className="text-right">
                  <TopicActions id={t.id} status={t.status} saved={savedIds?.has(t.id)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
