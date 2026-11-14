import type { NextRequest } from "next/server";
import { cachedGet, jsonError, preflight } from "@/lib/app-api/http";
import { getTopicDetail } from "@/lib/data/feed";
import { getDb } from "@/lib/db/client";

/** GET /api/app/v1/topics/:id → story: topic, every source article, 24 h score history. */
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number.parseInt((await params).id, 10);
  if (!Number.isSafeInteger(id) || id <= 0) return jsonError(400, "Invalid topic id");
  return cachedGet(req, `topic:${id}`, () => getTopicDetail(getDb(), id));
}
