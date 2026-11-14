import type { NextRequest } from "next/server";
import { z } from "zod";
import { bannedError, caller, json, jsonError, preflight, readJson } from "@/lib/app-api/http";
import { REACTION_TYPES, setReaction, topicIsVisible } from "@/lib/data/social";
import { getDb } from "@/lib/db/client";

/**
 * PUT    /api/app/v1/topics/:id/reaction {type: hot|useful|skeptical|wow} → {reaction, counters}
 * DELETE /api/app/v1/topics/:id/reaction                               → {reaction: null, counters}
 */
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

type Ctx = { params: Promise<{ id: string }> };

async function handle(req: NextRequest, ctx: Ctx, type: (typeof REACTION_TYPES)[number] | null) {
  const c = await caller(req, true);
  if (c.error) return c.error;
  const banned = bannedError(c.user!);
  if (banned) return banned;
  const id = Number.parseInt((await ctx.params).id, 10);
  const db = getDb();
  if (!Number.isSafeInteger(id) || !(await topicIsVisible(db, id))) return jsonError(404, "Not found");
  return json(await setReaction(db, c.user!.id, id, type));
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const body = await readJson(req, z.object({ type: z.enum(REACTION_TYPES) }));
  if (body.error) return body.error;
  return handle(req, ctx, body.data.type);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(req, ctx, null);
}
