import type { NextRequest } from "next/server";
import { z } from "zod";
import { json, jsonError, preflight, readJson } from "@/lib/app-api/http";
import { createVerificationToken, signUp, validateSignup } from "@/lib/auth/accounts";
import { emailLinkOrigin } from "@/lib/auth/links";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { alreadyRegisteredMail, sendMail, verificationMail } from "@/lib/mail";
import { clientIp } from "@/lib/util/rate-limit";
import { emailLimiter } from "../limits";

/**
 * POST /api/app/v1/auth/signup {email, password} → 202 {sentTo}
 * Same Trend Pool member accounts as the website: the confirmation link opens the website's /verify
 * page. Same answer whether or not the email already has an account (no account probing).
 */
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const Body = z.object({ email: z.string().max(254), password: z.string().max(200) });

export async function POST(req: NextRequest) {
  const body = await readJson(req, Body);
  if (body.error) return body.error;
  const valid = validateSignup({ ...body.data, confirm: body.data.password });
  if (!valid.ok) return jsonError(400, valid.error);
  const rl = emailLimiter.take(clientIp(req.headers));
  if (!rl.allowed) {
    return jsonError(429, `Too many sign-ups. Try again in ${Math.ceil(rl.retryAfterSec / 60)} min.`);
  }

  const cfg = getConfig();
  const db = getDb();
  const outcome = await signUp(db, valid.email, body.data.password);
  const origin = emailLinkOrigin(cfg.APP_URL, req.headers);
  try {
    if (outcome.kind === "registered") {
      await sendMail(alreadyRegisteredMail(outcome.email, origin, cfg.MAIL_FROM_NAME));
    } else if (outcome.kind !== "taken") {
      const token = await createVerificationToken(db, outcome.userId);
      const link = `${origin}/verify?${new URLSearchParams({ token })}`;
      await sendMail(verificationMail(outcome.email, link, cfg.MAIL_FROM_NAME));
    }
  } catch (err) {
    logger.error({ err }, "app signup email failed");
    return jsonError(502, "We could not send the confirmation email. Try again in a few minutes.");
  }
  logger.info({ outcome: outcome.kind }, "app signup");
  return json({ sentTo: valid.email }, 202);
}
