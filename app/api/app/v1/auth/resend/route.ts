import type { NextRequest } from "next/server";
import { z } from "zod";
import { json, jsonError, preflight, readJson } from "@/lib/app-api/http";
import { createVerificationToken, normalizeEmail, unverifiedMemberId } from "@/lib/auth/accounts";
import { APP_NAME } from "@/lib/app-links";
import { emailLinkOrigin } from "@/lib/auth/links";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { sendMail, verificationMail } from "@/lib/mail";
import { clientIp } from "@/lib/util/rate-limit";
import { emailLimiter } from "../limits";

/** POST /api/app/v1/auth/resend {email} → 202 (always; a new link goes only to unconfirmed accounts). */
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export async function POST(req: NextRequest) {
  const body = await readJson(req, z.object({ email: z.string().max(254) }));
  if (body.error) return body.error;
  const rl = emailLimiter.take(clientIp(req.headers));
  if (!rl.allowed) {
    return jsonError(429, `Please wait ${Math.ceil(rl.retryAfterSec / 60)} min before asking again.`);
  }
  const db = getDb();
  const email = normalizeEmail(body.data.email);
  const userId = await unverifiedMemberId(db, email);
  if (userId) {
    const cfg = getConfig();
    try {
      const token = await createVerificationToken(db, userId);
      const link = `${emailLinkOrigin(cfg.APP_URL, req.headers)}/verify?${new URLSearchParams({ token })}`;
      await sendMail({ ...verificationMail(email, link, APP_NAME), fromName: APP_NAME });
    } catch (err) {
      logger.error({ err }, "app resend email failed");
      return jsonError(502, "We could not send the email. Try again in a few minutes.");
    }
  }
  return json({ sentTo: email }, 202);
}
