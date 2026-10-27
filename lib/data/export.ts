import type { TopicListRow } from "./topics";

/*
 * "Export" on the Pool page: the topics matching the current filters as a CSV (opens directly in
 * Excel / Google Sheets) or JSON file. Built here as plain strings so it is easy to test.
 */

export type ExportFormat = "csv" | "json";

export type ExportRow = {
  title: string;
  url: string;
  score: number;
  category: string;
  tags: string;
  language: string;
  published: string;
  sources: string;
  source_count: number;
  summary: string;
};

export function toExportRow(t: TopicListRow): ExportRow {
  return {
    title: t.title,
    url: t.canonicalUrl ?? "",
    score: Math.round(t.score * 1000) / 1000,
    category: t.category ?? "",
    tags: t.tags.join(", "),
    language: t.lang ?? "",
    published: t.publishedAt.toISOString(),
    sources: t.sources.map((s) => s.name).join(", "),
    source_count: t.sourceCount,
    summary: t.llmSummary ?? "",
  };
}

const COLUMNS: (keyof ExportRow)[] = [
  "title",
  "url",
  "score",
  "category",
  "tags",
  "language",
  "published",
  "sources",
  "source_count",
  "summary",
];

// Spreadsheet apps run cells starting with = + - @ as formulas: prefix them so a hostile headline
// can't become a formula when the file is opened.
const csvCell = (v: string | number) => {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * CSV with a UTF-8 byte-order mark (so Excel shows Turkish letters correctly) and CRLF line endings.
 */
export function toCsv(rows: ExportRow[]): string {
  const lines = [COLUMNS.join(","), ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(","))];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function toJson(rows: ExportRow[], meta: { exportedAt: Date; filters: string }): string {
  return JSON.stringify(
    { exportedAt: meta.exportedAt.toISOString(), filters: meta.filters, count: rows.length, topics: rows },
    null,
    2,
  );
}

/**
 * e.g. "trend-pool-2026-10-27-ai.csv" (the quick-view/category/tag in the name when set). The date is
 * the server's local date (TZ), not UTC, so a download just after midnight isn't named after yesterday.
 */
export function exportFilename(
  format: ExportFormat,
  f: { category?: string; tag?: string },
  now = new Date(),
  timeZone = process.env.TZ || "UTC",
): string {
  // sv-SE formats dates as YYYY-MM-DD.
  const day = now.toLocaleDateString("sv-SE", { timeZone });
  const label = [f.category, f.tag]
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `trend-pool-${day}${label ? `-${label}` : ""}.${format}`;
}
