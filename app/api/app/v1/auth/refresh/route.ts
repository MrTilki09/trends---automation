import type { NextRequest } from "next/server";
import { z } from "zod";
import { refreshAppSession } from "@/lib/app-api/auth";
import { json, jsonError, preflight, rateLimited, readJson, sessionSecret } from "@/lib/app-api/http";
import { getDb } from "@/lib/db/client";

/** POST /api/app/v1/auth/refresh {refreshToken} → a new token pair (the old refresh token stops working). */
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export async function POST(req: NextRequest) {
  const limited = rateLimited(req);
  if (limited) return limited;
  const secret = sessionSecret();
  if (!secret) return jsonError(503, "Sign-in is not configured on this server.");
  const body = await readJson(req, z.object({ refreshToken: z.string().max(100) }));
  if (body.error) return body.error;
  const tokens = await refreshAppSession(getDb(), body.data.refreshToken, secret);
  return tokens ? json(tokens) : jsonError(401, "Session expired. Sign in again.");
}
