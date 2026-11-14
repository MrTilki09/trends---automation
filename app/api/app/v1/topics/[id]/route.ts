import type { NextRequest } from "next/server";
import { cachedGet, caller, json, jsonError, preflight } from "@/lib/app-api/http";
import { getTopicDetail } from "@/lib/data/feed";
import { getDb } from "@/lib/db/client";

/** GET /api/app/v1/topics/:id → story: topic, every source article, 24 h score history (+ viewer state when signed in). */
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number.parseInt((await params).id, 10);
  if (!Number.isSafeInteger(id) || id <= 0) return jsonError(400, "Invalid topic id");
  if (!req.headers.get("authorization")) return cachedGet(req, `topic:${id}`, () => getTopicDetail(getDb(), id));
  const c = await caller(req, false);
  if (c.error) return c.error;
  const detail = await getTopicDetail(getDb(), id, c.user!.id);
  return detail ? json(detail) : jsonError(404, "Not found");
}
