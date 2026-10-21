import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { TopicActions } from "@/components/topic-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listSources } from "@/lib/data/sources";
import {
  listFacets,
  listTopics,
  FOCUSES,
  SORTS,
  TIME_WINDOWS,
  TOPIC_STATUSES,
  type Focus,
  type SortKey,
  type TimeWindow,
  type TopicFilters,
} from "@/lib/data/topics";
import { getDb } from "@/lib/db/client";
import type { TopicStatus } from "@/lib/db/schema";
import { formatDateTime, hostOf, relativeTime } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

const LANG_NAMES: Record<string, string> = { tr: "Turkish", en: "English" };

/** Builds a /pool URL with the current filters plus `change` (undefined removes a key). */
function poolHref(current: TopicFilters, change: Partial<Record<keyof TopicFilters, string | undefined>>) {
  const params = new URLSearchParams();
  const merged = { ...current, ...change };
  for (const key of [
    "focus",
    "status",
    "window",
    "sort",
    "category",
    "tag",
    "lang",
    "source",
    "q",
  ] as const) {
    const v = merged[key];
    if (v != null && v !== "") params.set(key, String(v));
  }
  return `/pool?${params.toString()}`;
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

export default async function PoolPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const status = (one(sp.status) ?? "new") as TopicStatus | "all";
  const window = (one(sp.window) ?? "72h") as TimeWindow;
  const sort = (one(sp.sort) ?? "score") as SortKey;
  const focus = (one(sp.focus) ?? "tech") as Focus;
  const filters: TopicFilters = {
    focus: focus in FOCUSES ? focus : "tech",
    status: status === "all" || TOPIC_STATUSES.includes(status) ? status : "new",
    window: window in TIME_WINDOWS ? window : "72h",
    sort: sort in SORTS ? sort : "score",
    source: one(sp.source),
    category: one(sp.category),
    tag: one(sp.tag),
    lang: one(sp.lang),
    q: one(sp.q),
  };

  const db = getDb();
  const [topics, sources, facets] = await Promise.all([
    listTopics(db, filters),
    listSources(db),
    listFacets(db, filters),
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
              {filters.window !== "all" ? ` published in the last ${filters.window}` : ""},{" "}
              {filters.sort === "newest" ? "newest first" : "ranked by score"}
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
              { focus: filters.focus, status: filters.status, window: filters.window, sort: filters.sort },
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
          <select name="sort" defaultValue={filters.sort} className={selectClass} aria-label="Sort">
            {Object.entries(SORTS).map(([k, label]) => (
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

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 text-right">Score</TableHead>
              <TableHead>Topic</TableHead>
              <TableHead>Sources</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Published</TableHead>
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
