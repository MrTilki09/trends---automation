import type { NextRequest } from "next/server";
import { z } from "zod";
import { createAppSession } from "@/lib/app-api/auth";
import { json, jsonError, preflight, readJson, sessionSecret } from "@/lib/app-api/http";
import { memberLookup } from "@/lib/auth/accounts";
import { checkLogin } from "@/lib/auth/login";
import { authSettings } from "@/lib/auth/server";
import { ensureUser } from "@/lib/data/users";
import { getDb } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { clientIp } from "@/lib/util/rate-limit";

/**
 * POST /api/app/v1/auth/login {email, password, device?} → {accessToken, refreshToken, expiresIn}
 * Same accounts and the same brute-force limit as the website login.
 */
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const Body = z.object({
  email: z.string().max(254),
  password: z.string().max(200),
  device: z.string().max(100).optional(),
});

export async function POST(req: NextRequest) {
  const secret = sessionSecret();
  if (!secret) return jsonError(503, "Sign-in is not configured on this server.");
  const body = await readJson(req, Body);
  if (body.error) return body.error;
  const db = getDb();
  const ip = clientIp(req.headers);
  const result = await checkLogin(
    { user: body.data.email.trim(), password: body.data.password, ip },
    authSettings(),
    memberLookup(db),
  );
  if (!result.ok) {
    logger.warn({ ip, reason: result.error }, "app login failed");
    return jsonError(result.retryAfterSec ? 429 : 401, result.error, result.unverified ? { "X-Unverified": "1" } : {});
  }
  const user = await ensureUser(db, result.user);
  return json(await createAppSession(db, user.id, body.data.device, secret));
}
