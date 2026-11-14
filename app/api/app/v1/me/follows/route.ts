import type { NextRequest } from "next/server";
import { z } from "zod";
import { caller, json, preflight, readJson } from "@/lib/app-api/http";
import { FollowInput, listFollows, MAX_FOLLOWS, setFollows } from "@/lib/data/app-users";
import { getDb } from "@/lib/db/client";

/**
 * GET /api/app/v1/me/follows → {follows}
 * PUT /api/app/v1/me/follows {follows: [{kind, value}]} → replaces them (also completes onboarding).
 * kind: category ("AI"), company ("nvidia"), tag ("open source"), lang ("tr").
 */
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export async function GET(req: NextRequest) {
  const c = await caller(req, true);
  if (c.error) return c.error;
  return json({ follows: await listFollows(getDb(), c.user!.id) });
}

export async function PUT(req: NextRequest) {
  const c = await caller(req, true);
  if (c.error) return c.error;
  const body = await readJson(req, z.object({ follows: z.array(FollowInput).max(MAX_FOLLOWS * 2) }));
  if (body.error) return body.error;
  return json({ follows: await setFollows(getDb(), c.user!.id, body.data.follows) });
}
