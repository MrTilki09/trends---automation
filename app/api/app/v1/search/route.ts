import type { NextRequest } from "next/server";
import { cachedGet, jsonError, param, preflight } from "@/lib/app-api/http";
import { searchTopics } from "@/lib/data/feed";
import { getDb } from "@/lib/db/client";

/** GET /api/app/v1/search?q=&cursor= → tech topics of the last 30 days matching q, newest first. */
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

export async function GET(req: NextRequest) {
  const q = param(req, "q", 100);
  if (!q || q.length < 2) return jsonError(400, "q must be at least 2 characters");
  const cursor = param(req, "cursor", 200);
  return cachedGet(req, `search:${q.toLowerCase()}:${cursor ?? ""}`, () =>
    searchTopics(getDb(), q, cursor),
  );
}
