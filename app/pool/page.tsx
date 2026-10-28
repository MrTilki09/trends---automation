import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { ApiUrlBox } from "@/components/api-url-box";
import { ExportButtons } from "@/components/export-buttons";
import { PoolPagination } from "@/components/pool-pagination";
import { StatusBadge } from "@/components/status-badge";
import { TopicActions } from "@/components/topic-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSignedInUser, getViewer } from "@/lib/auth/server";
import { savedTopicIds } from "@/lib/data/saved";
import { listSources } from "@/lib/data/sources";
import {
  filtersToQuery,
  PAGE_SIZES,
  parsePage,
  parseTopicFilters,
  publicView,
} from "@/lib/data/topic-filters";
import {
  countTopics,
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

/**
 * Builds a /pool URL with the current filters plus `change` (undefined removes a key). Keeps a
 * non-default page size; any filter change starts again at page 1.
 */
function poolHref(
  current: TopicFilters,
  change: Partial<Record<keyof TopicFilters, string | undefined>>,
  paging: { page?: number; per?: number } = {},
) {
  const params = new URLSearchParams(filtersToQuery(current, change));
  if (paging.per && paging.per !== PAGE_SIZES[0]) params.set("per", String(paging.per));
  if (paging.page && paging.page > 1) params.set("page", String(paging.page));
  return `/pool?${params}`;
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
  per,
}: {
  col: SortKey;
  label: string;
  filters: TopicFilters;
  className?: string;
  align?: "right";
  per: number;
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
        href={poolHref(filters, { sort: col, dir: nextDir }, { per })}
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

/**
 * The home page. Public and read-only for signed-out visitors (proxy.ts lets GET through): they see
 * every topic except ones the owner ignored, can filter, page and export, but get no buttons that
 * change anything and no links to the private topic pages.
 */
export default async function PoolPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await getViewer();
  const isPublic = !viewer;
  const params = await searchParams;
  const parsed = parseTopicFilters(params);
  const filters = isPublic ? publicView(parsed) : parsed;
  const sort = filters.sort ?? "score";
  const dir = filters.dir ?? DEFAULT_DIR[sort];
  const { page: requestedPage, per } = parsePage(params);

  const db = getDb();
  const user = isPublic ? null : await getSignedInUser();
  const [total, sources, facets, savedIds] = await Promise.all([
    countTopics(db, filters),
    listSources(db),
    listFacets(db, filters),
    user ? savedTopicIds(db, user.id) : null,
  ]);
  // A page past the end (e.g. after narrowing the filters) shows the last page instead of nothing.
  const pageCount = Math.max(1, Math.ceil(total / per));
  const page = Math.min(requestedPage, pageCount);
  const topics = await listTopics(db, { ...filters, limit: per, offset: (page - 1) * per });
  const href = (change: Partial<Record<keyof TopicFilters, string | undefined>>) =>
    poolHref(filters, change, { per });
  const pageHref = (p: number, n: number) => poolHref(filters, {}, { page: p, per: n });
  const columns = isPublic ? 5 : 7;
  const hasExtraFilters = Boolean(
    filters.source || filters.category || filters.tag || filters.lang || filters.q,
  );

  return (
    <div className="space-y-4">
      {isPublic && (
        <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          <p>
            <span className="font-medium">Free, live-ranked tech news.</span> Stories from 45+ sources, merged
            when several outlets cover the same thing and ranked by how much they&apos;re trending. Filter,
            search, and export what you see.
          </p>
          <p className="pt-1 text-muted-foreground">
            <Link href="/signup" className="font-medium text-foreground underline underline-offset-2">
              Create a free account
            </Link>{" "}
            to save stories and turn them into ready-to-post social media drafts.
          </p>
        </div>
      )}
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">{isPublic ? "Trending tech news" : "Pool"}</h1>
            <p className="text-sm text-muted-foreground">
              {total} topic{total === 1 ? "" : "s"}
              {filters.window !== "all" ? ` published in the last ${filters.window}` : ""}, sorted by{" "}
              {SORTS[sort].toLowerCase()} {dir === "asc" ? "↑" : "↓"}
            </p>
          </div>
          {hasExtraFilters && (
            <Link
              href={href({
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
            const viewHref = poolHref(
              {
                focus: filters.focus,
                status: isPublic ? undefined : filters.status,
                window: filters.window,
                sort: filters.sort,
                dir: filters.dir,
              },
              v.change,
              { per },
            );
            const active = filters.category === v.change.category && filters.tag === v.change.tag;
            return (
              <Link
                key={v.label}
                href={viewHref}
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
          {per !== PAGE_SIZES[0] && <input type="hidden" name="per" value={per} />}
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
          {!isPublic && (
            <select name="status" defaultValue={filters.status} className={selectClass} aria-label="Status">
              <option value="all">All statuses</option>
              {TOPIC_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
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
          {/* Free text with suggestions: "apple, launch, -deals" = all of these tags, none of "deals". */}
          <Input
            name="tag"
            list="tag-options"
            defaultValue={filters.tag ?? ""}
            placeholder="Tags: ai, -deals"
            aria-label="Tags"
            title="Comma-separated tags; prefix with - to exclude (e.g. apple, launch, -deals)"
            className="w-44"
          />
          <datalist id="tag-options">
            {facets.tags.map((t) => (
              <option key={t.value} value={t.value}>
                {`#${t.value} (${t.count})`}
              </option>
            ))}
          </datalist>
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

      {viewer?.role === "owner" && (
        <ApiUrlBox query={filtersToQuery(filters)} serverOrigin={await requestOrigin()} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ExportButtons query={filtersToQuery(filters)} total={total} />
        {pageCount > 1 && (
          <span className="text-sm text-muted-foreground">
            Page {page} of {pageCount}
          </span>
        )}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead
                col="score"
                label="Score"
                filters={filters}
                per={per}
                className="w-20"
                align="right"
              />
              <SortHead col="title" label="Topic" filters={filters} per={per} />
              <SortHead col="sources" label="Sources" filters={filters} per={per} />
              <SortHead col="category" label="Category" filters={filters} per={per} />
              <SortHead col="published" label="Published" filters={filters} per={per} />
              {!isPublic && <SortHead col="status" label="Status" filters={filters} per={per} />}
              {!isPublic && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {topics.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns} className="py-10 text-center text-muted-foreground">
                  {isPublic
                    ? "No topics match. Try a longer time window or fewer filters."
                    : "No topics match. Press “Run now” to collect, or widen the filters."}
                </TableCell>
              </TableRow>
            )}
            {topics.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="text-right font-mono tabular-nums">{t.score.toFixed(2)}</TableCell>
                <TableCell className="max-w-xl whitespace-normal">
                  {isPublic ? (
                    t.canonicalUrl ? (
                      <a
                        href={t.canonicalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium hover:underline"
                      >
                        {t.title}
                      </a>
                    ) : (
                      <span className="font-medium">{t.title}</span>
                    )
                  ) : (
                    <Link href={`/pool/${t.id}`} className="font-medium hover:underline">
                      {t.title}
                    </Link>
                  )}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-xs text-muted-foreground">
                    {t.lang && <span className="font-mono uppercase">{t.lang}</span>}
                    {t.canonicalUrl && (
                      <a href={t.canonicalUrl} target="_blank" rel="noreferrer" className="hover:underline">
                        {hostOf(t.canonicalUrl)} ↗
                      </a>
                    )}
                    {t.tags.slice(0, 4).map((tag) => (
                      <Link key={tag} href={href({ tag })} className="hover:text-foreground hover:underline">
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
                    <Link href={href({ category: t.category })}>
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
                {!isPublic && (
                  <TableCell>
                    <StatusBadge status={t.status} />
                  </TableCell>
                )}
                {!isPublic && (
                  <TableCell className="text-right">
                    <TopicActions
                      id={t.id}
                      status={t.status}
                      saved={savedIds?.has(t.id)}
                      canEdit={viewer?.role === "owner"}
                    />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <PoolPagination page={page} per={per} total={total} href={pageHref} />
    </div>
  );
}
