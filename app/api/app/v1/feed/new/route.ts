import type { NextRequest } from "next/server";
import { cachedGet, jsonError, param, preflight } from "@/lib/app-api/http";
import { countNewStories } from "@/lib/data/feed";
import { getDb } from "@/lib/db/client";

/** GET /api/app/v1/feed/new?since=<feedVersion>&category=&tag=&lang= → { feedVersion, newStories } */
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

export async function GET(req: NextRequest) {
  const since = Number.parseInt(param(req, "since", 12) ?? "", 10);
  if (!Number.isFinite(since) || since < 0) return jsonError(400, "since must be a feedVersion");
  const q = { category: param(req, "category", 60), tag: param(req, "tag", 60), lang: param(req, "lang", 5) };
  return cachedGet(req, `new:${since}:${JSON.stringify(q)}`, () => countNewStories(getDb(), q, since));
}
