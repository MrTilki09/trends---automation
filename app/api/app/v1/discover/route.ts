import type { NextRequest } from "next/server";
import { cachedGet, preflight } from "@/lib/app-api/http";
import { getDiscover } from "@/lib/data/feed";
import { getDb } from "@/lib/db/client";

/** GET /api/app/v1/discover → categories, trending companies and tags (24 h), editor picks. */
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

export async function GET(req: NextRequest) {
  return cachedGet(req, "discover", () => getDiscover(getDb()));
}
