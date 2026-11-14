import type { NextRequest } from "next/server";
import { caller, json, jsonError, preflight } from "@/lib/app-api/http";
import { setBlocked } from "@/lib/data/social";
import { getDb } from "@/lib/db/client";

/** PUT / DELETE /api/app/v1/blocks/:userId → {blocked}. Blocked users' comments are hidden from you. */
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

type Ctx = { params: Promise<{ userId: string }> };

async function handle(req: NextRequest, ctx: Ctx, blocked: boolean) {
  const c = await caller(req, true);
  if (c.error) return c.error;
  const other = Number.parseInt((await ctx.params).userId, 10);
  if (!Number.isSafeInteger(other) || other <= 0) return jsonError(400, "Invalid user id");
  if (!(await setBlocked(getDb(), c.user!.id, other, blocked))) return jsonError(400, "You can't block yourself.");
  return json({ blocked });
}

export const PUT = (req: NextRequest, ctx: Ctx) => handle(req, ctx, true);
export const DELETE = (req: NextRequest, ctx: Ctx) => handle(req, ctx, false);
