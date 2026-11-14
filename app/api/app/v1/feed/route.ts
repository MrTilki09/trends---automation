import type { NextRequest } from "next/server";
import { FeedTab } from "@/lib/app-api/schemas";
import { cachedGet, param, preflight } from "@/lib/app-api/http";
import { getFeed } from "@/lib/data/feed";
import { getDb } from "@/lib/db/client";

/** GET /api/app/v1/feed?tab=for-you|trending|latest&category=&tag=&lang=&cursor=&limit= */
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

export async function GET(req: NextRequest) {
  const tab = FeedTab.catch("trending").parse(param(req, "tab"));
  const q = {
    tab,
    category: param(req, "category", 60),
    tag: param(req, "tag", 60),
    lang: param(req, "lang", 5),
    cursor: param(req, "cursor", 200),
    limit: Number.parseInt(param(req, "limit", 3) ?? "", 10) || undefined,
  };
  return cachedGet(req, `feed:${JSON.stringify(q)}`, () => getFeed(getDb(), q));
}
