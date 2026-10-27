import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/server";
import { exportFilename, toCsv, toExportRow, toJson, type ExportFormat } from "@/lib/data/export";
import { EXPORT_MAX_ROWS, filtersToQuery, parseTopicFilters, publicView } from "@/lib/data/topic-filters";
import { listTopics } from "@/lib/data/topics";
import { getDb } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { clientIp, RateLimiter } from "@/lib/util/rate-limit";

/*
 * GET /pool/export?format=csv|json&<the Pool's filters>: every topic matching the current view (up to
 * EXPORT_MAX_ROWS) as a download. Public like the Pool page itself: signed-out visitors get the public
 * view (no ignored topics). Exports are heavier than page views, so each IP gets 10 at once, then 1
 * every 10 seconds.
 */
export const dynamic = "force-dynamic";

const limiter = new RateLimiter(10, 1 / 10);

export async function GET(req: NextRequest) {
  const rl = limiter.take(clientIp(req.headers));
  if (!rl.allowed) {
    return new NextResponse(`Too many exports. Try again in ${rl.retryAfterSec} s.`, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSec), "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const params = req.nextUrl.searchParams;
  const format: ExportFormat = params.get("format") === "json" ? "json" : "csv";
  const viewer = await getViewer();
  const parsed = parseTopicFilters(params);
  const filters = viewer ? parsed : publicView(parsed);

  try {
    const rows = (await listTopics(getDb(), { ...filters, limit: EXPORT_MAX_ROWS, offset: 0 })).map(
      toExportRow,
    );
    const body =
      format === "json"
        ? toJson(rows, { exportedAt: new Date(), filters: filtersToQuery(filters) })
        : toCsv(rows);
    return new NextResponse(body, {
      headers: {
        "Content-Type": format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename(format, filters)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error({ err }, "pool export failed");
    return new NextResponse("Export failed, please try again.", { status: 500 });
  }
}
