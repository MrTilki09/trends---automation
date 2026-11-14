import type { NextRequest } from "next/server";
import { z } from "zod";
import { revokeAppSession } from "@/lib/app-api/auth";
import { json, preflight, rateLimited, readJson } from "@/lib/app-api/http";
import { getDb } from "@/lib/db/client";

/** POST /api/app/v1/auth/logout {refreshToken} → {ok} (ends this device's session). */
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export async function POST(req: NextRequest) {
  const limited = rateLimited(req);
  if (limited) return limited;
  const body = await readJson(req, z.object({ refreshToken: z.string().max(100) }));
  if (body.error) return body.error;
  await revokeAppSession(getDb(), body.data.refreshToken);
  return json({ ok: true });
}
