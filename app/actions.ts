"use server";

// Server actions: the dashboard's only way to change data. Each one calls a lib/ function;
// the web app never runs collection itself, it only queues a job for the worker.
// Server actions are public POST endpoints: every one except login/signup checks the viewer itself.
// Changing the pool, sources or API keys is owner-only; members (signup accounts) only browse.
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  createVerificationToken,
  memberLookup,
  signUp,
  unverifiedMemberId,
  validateSignup,
} from "@/lib/auth/accounts";
import { checkLogin } from "@/lib/auth/login";
import { assertOwner, authSettings, endSession, startSession } from "@/lib/auth/server";
import { safeNextPath } from "@/lib/auth/session";
import { createApiKey, revokeApiKey } from "@/lib/data/api-keys";
import { enqueueJob } from "@/lib/data/jobs";
import { setSourceEnabled } from "@/lib/data/sources";
import { setTopicStatus, TOPIC_STATUSES } from "@/lib/data/topics";
import { getDb } from "@/lib/db/client";
import type { TopicStatus } from "@/lib/db/schema";
import { getConfig } from "@/lib/config";
import { logger } from "@/lib/logger";
import { sendMail, verificationMail } from "@/lib/mail";
import { clientIp, RateLimiter } from "@/lib/util/rate-limit";

export async function runNowAction(): Promise<{ queued: boolean }> {
  await assertOwner();
  const job = await enqueueJob(getDb(), "collect", { trigger: "manual" });
  revalidatePath("/", "layout");
  return { queued: job !== null };
}

export async function setTopicStatusAction(formData: FormData): Promise<void> {
  await assertOwner();
  const id = Number(formData.get("id"));
  const status = String(formData.get("status")) as TopicStatus;
  if (!Number.isInteger(id) || !TOPIC_STATUSES.includes(status)) throw new Error("Invalid input");
  await setTopicStatus(getDb(), id, status);
  revalidatePath("/pool");
  revalidatePath(`/pool/${id}`);
}

export async function toggleSourceAction(formData: FormData): Promise<void> {
  await assertOwner();
  const id = Number(formData.get("id"));
  const enabled = formData.get("enabled") === "true";
  if (!Number.isInteger(id)) throw new Error("Invalid input");
  await setSourceEnabled(getDb(), id, enabled);
  revalidatePath("/sources");
}

export type CreateKeyState = { key?: string; name?: string; error?: string };

export async function createApiKeyAction(_prev: CreateKeyState, formData: FormData): Promise<CreateKeyState> {
  await assertOwner();
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, 80);
  if (!name) return { error: "Give the key a name (e.g. which app uses it)." };
  const { key } = await createApiKey(getDb(), name);
  revalidatePath("/keys");
  return { key, name };
}

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  await assertOwner();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) throw new Error("Invalid input");
  await revokeApiKey(getDb(), id);
  revalidatePath("/keys");
}

export type LoginState = { error?: string; unverifiedEmail?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const ip = clientIp(await headers());
  const user = String(formData.get("user") ?? "").trim();
  const auth = authSettings();
  const result = await checkLogin(
    { user, password: String(formData.get("password") ?? ""), ip },
    auth,
    memberLookup(getDb()),
  );
  if (!result.ok) {
    logger.warn({ ip, user, reason: result.error }, "dashboard login failed");
    return { error: result.error, unverifiedEmail: result.unverified ? user : undefined };
  }
  await startSession(result.user, result.role, auth!);
  redirect(safeNextPath(formData.get("next")));
}

// Signup and "send the link again" share one limit: 5 emails per IP, then 1 every 10 minutes.
const emailLimiter = new RateLimiter(5, 1 / 600);

/** Absolute link for emails: APP_URL, else the host the visitor used (works behind Caddy). */
async function appOrigin(): Promise<string> {
  const configured = getConfig().APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "http";
  return `${proto}://${host}`;
}

async function sendVerification(userId: number, email: string): Promise<void> {
  const token = await createVerificationToken(getDb(), userId);
  const link = `${await appOrigin()}/verify?${new URLSearchParams({ token })}`;
  await sendMail(verificationMail(email, link, getConfig().MAIL_FROM_NAME));
}

export type SignupState = { error?: string; sentTo?: string; values?: { email: string } };

export async function signupAction(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const raw = {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  };
  const valid = validateSignup(raw);
  if (!valid.ok) return { error: valid.error, values: { email: raw.email } };
  if (!authSettings())
    return { error: "Sign-up is not available on this server yet.", values: { email: raw.email } };

  const ip = clientIp(await headers());
  const rl = emailLimiter.take(ip);
  if (!rl.allowed) {
    return {
      error: `Too many sign-ups. Try again in ${Math.ceil(rl.retryAfterSec / 60)} min.`,
      values: { email: raw.email },
    };
  }

  const outcome = await signUp(getDb(), valid.email, raw.password);
  if (outcome.kind !== "taken") {
    try {
      await sendVerification(outcome.userId, outcome.email);
    } catch (err) {
      logger.error({ err, email: outcome.email }, "verification email failed");
      return {
        error: "We couldn't send the confirmation email. Try again in a few minutes.",
        values: { email: raw.email },
      };
    }
  }
  logger.info({ ip, email: valid.email, outcome: outcome.kind }, "signup");
  // Same answer whether or not the email already has an account, so nobody can probe for accounts.
  return { sentTo: valid.email };
}

export type ResendState = { message?: string; error?: string };

export async function resendVerificationAction(_prev: ResendState, formData: FormData): Promise<ResendState> {
  const email = String(formData.get("email") ?? "");
  const rl = emailLimiter.take(clientIp(await headers()));
  if (!rl.allowed)
    return { error: `Please wait ${Math.ceil(rl.retryAfterSec / 60)} min before asking again.` };
  const userId = await unverifiedMemberId(getDb(), email);
  if (userId) {
    try {
      await sendVerification(userId, email.trim().toLowerCase());
    } catch (err) {
      logger.error({ err, email }, "verification email failed");
      return { error: "We couldn't send the email. Try again in a few minutes." };
    }
  }
  return {
    message:
      "If that account still needs confirming, a new link is on its way. Check your inbox and spam folder.",
  };
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}
