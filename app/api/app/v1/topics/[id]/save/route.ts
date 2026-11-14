import type { NextRequest } from "next/server";
import { caller, json, jsonError, preflight } from "@/lib/app-api/http";
import { setSaved, topicIsVisible } from "@/lib/data/social";
import { getDb } from "@/lib/db/client";

/**
 * PUT    /api/app/v1/topics/:id/save → {saved: true, counters}
 * DELETE /api/app/v1/topics/:id/save → {saved: false, counters}
 * Same Saved list as the website (saved topics are never removed by retention).
 */
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

type Ctx = { params: Promise<{ id: string }> };

async function handle(req: NextRequest, ctx: Ctx, saved: boolean) {
  const c = await caller(req, true);
  if (c.error) return c.error;
  const id = Number.parseInt((await ctx.params).id, 10);
  const db = getDb();
  if (!Number.isSafeInteger(id) || !(await topicIsVisible(db, id))) return jsonError(404, "Not found");
  return json(await setSaved(db, c.user!.id, id, saved));
}

export const PUT = (req: NextRequest, ctx: Ctx) => handle(req, ctx, true);
export const DELETE = (req: NextRequest, ctx: Ctx) => handle(req, ctx, false);
