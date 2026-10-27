import { Download } from "lucide-react";
import { EXPORT_MAX_ROWS } from "@/lib/data/topic-filters";

const link =
  "inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent";

/** "Export" for the current view: every matching topic (not just this page) as CSV or JSON. */
export function ExportButtons({ query, total }: { query: string; total: number }) {
  const href = (format: "csv" | "json") => `/pool/export?${query ? `${query}&` : ""}format=${format}`;
  const count = Math.min(total, EXPORT_MAX_ROWS);
  const title = `Download all ${count} matching topics${total > EXPORT_MAX_ROWS ? ` (first ${EXPORT_MAX_ROWS})` : ""}`;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm text-muted-foreground">Export:</span>
      <a
        href={href("csv")}
        className={link}
        title={`${title} as a spreadsheet (Excel, Google Sheets)`}
        download
      >
        <Download className="size-3.5" />
        CSV
      </a>
      <a href={href("json")} className={link} title={`${title} as JSON`} download>
        <Download className="size-3.5" />
        JSON
      </a>
    </div>
  );
}
