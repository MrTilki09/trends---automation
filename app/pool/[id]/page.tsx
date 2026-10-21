import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { TopicActions } from "@/components/topic-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getTopic } from "@/lib/data/topics";
import { getDb } from "@/lib/db/client";
import { formatDateTime, hostOf, relativeTime } from "@/lib/utils";

export default async function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = Number.isInteger(Number(id)) ? await getTopic(getDb(), Number(id)) : null;
  if (!data) notFound();
  const { topic, items } = data;
  const b = topic.scoreBreakdown;

  const rows: [string, string, string][] = b
    ? [
        ["Engagement", b.engagement.toFixed(3), "Best item's percentile within its source × source weight"],
        [
          "Cross-source bonus",
          `+${b.crossSourceBonus.toFixed(2)}`,
          `Seen on ${topic.sourceCount} source(s): +0.3 per extra, max 0.9`,
        ],
        [
          "Keyword boost",
          `+${b.keywordBoost.toFixed(2)}`,
          b.matchedKeywords.length ? `Matched: ${b.matchedKeywords.join(", ")}` : "No niche keyword matched",
        ],
        [
          "Launch boost",
          `+${(b.launchBoost ?? 0).toFixed(2)}`,
          b.launchBoost ? "New release / announcement" : "Not a launch",
        ],
        [
          "LLM boost",
          `+${b.llmBoost.toFixed(2)}`,
          topic.llmRelevance != null ? `0.5 × relevance ${topic.llmRelevance}` : "Not enriched",
        ],
        ["Recency decay", `× ${b.recencyDecay.toFixed(3)}`, `${b.ageHours ?? "?"} h since published`],
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/pool" className="text-sm text-muted-foreground hover:underline">
          ← Pool
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">{topic.title}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <StatusBadge status={topic.status} />
              {(topic.category ?? topic.llmCategory) && (
                <Link href={`/pool?category=${encodeURIComponent((topic.category ?? topic.llmCategory)!)}`}>
                  <Badge variant="outline">{topic.category ?? topic.llmCategory}</Badge>
                </Link>
              )}
              {topic.lang && <span className="font-mono uppercase">{topic.lang}</span>}
              <span title={formatDateTime(topic.publishedAt)}>
                published {formatDateTime(topic.publishedAt ?? topic.firstSeenAt)}
              </span>
              <span>· first seen {relativeTime(topic.firstSeenAt)}</span>
              <span>· last seen {relativeTime(topic.lastSeenAt)}</span>
              {topic.canonicalUrl && (
                <a href={topic.canonicalUrl} target="_blank" rel="noreferrer" className="hover:underline">
                  · {hostOf(topic.canonicalUrl)} ↗
                </a>
              )}
            </div>
            {topic.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1 text-xs">
                {topic.tags.map((t) => (
                  <Link
                    key={t}
                    href={`/pool?tag=${encodeURIComponent(t)}`}
                    className="text-muted-foreground hover:text-foreground hover:underline"
                  >
                    #{t}
                  </Link>
                ))}
              </div>
            )}
            {topic.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {topic.keywords.map((k) => (
                  <Badge key={k} variant="secondary" className="font-normal">
                    {k}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <TopicActions id={topic.id} status={topic.status} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              Score <span className="font-mono">{topic.score.toFixed(3)}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              (engagement + cross-source + keyword + launch + LLM) × recency decay
            </p>
            {rows.length === 0 && <p className="text-muted-foreground">Not scored yet.</p>}
            {rows.map(([label, value, why]) => (
              <div
                key={label}
                className="flex items-baseline justify-between gap-4 border-b pb-1 last:border-0"
              >
                <div>
                  <div>{label}</div>
                  <div className="text-xs text-muted-foreground">{why}</div>
                </div>
                <div className="font-mono tabular-nums">{value}</div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>LLM summary</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {topic.llmSummary ? (
              <>
                <p>{topic.llmSummary}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Category {topic.llmCategory} · relevance {topic.llmRelevance} ·{" "}
                  {formatDateTime(topic.llmEnrichedAt)}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">Not enriched (LLM enrichment is optional, see README).</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold">Linked items ({items.length})</h2>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Metrics</TableHead>
                <TableHead>Published</TableHead>
                <TableHead>Fetched</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {it.sourceName}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xl whitespace-normal">
                    {it.url ? (
                      <a
                        href={it.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium hover:underline"
                      >
                        {it.title}
                      </a>
                    ) : (
                      <span className="font-medium">{it.title}</span>
                    )}
                    {it.summary && <p className="line-clamp-2 text-xs text-muted-foreground">{it.summary}</p>}
                    {it.tags.length > 0 && (
                      <p className="pt-0.5 text-xs text-muted-foreground">
                        {it.tags.map((t) => `#${t}`).join(" ")}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {Object.entries(it.metrics).length
                      ? Object.entries(it.metrics)
                          .map(([k, v]) => `${k}: ${v.toLocaleString("en-US")}`)
                          .join(", ")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTime(it.publishedAt)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {relativeTime(it.fetchedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
