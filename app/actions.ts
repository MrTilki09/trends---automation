"use server";

// Server actions: the dashboard's only way to change data. Each one calls a lib/ function;
// the web app never runs collection itself, it only queues a job for the worker.
// Server actions are public POST endpoints: every one except login/signup checks the viewer itself.
// Changing the pool, sources or API keys is owner-only; members (signup accounts) only browse.
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  completeEmailToken,
  createEmailToken,
  createVerificationToken,
  memberLookup,
  passwordHelpFor,
  signUp,
  unverifiedMemberId,
  validateNewPassword,
  validateSignup,
} from "@/lib/auth/accounts";
import { emailLinkOrigin } from "@/lib/auth/links";
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
import { alreadyRegisteredMail, resetPasswordMail, sendMail, verificationMail } from "@/lib/mail";
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

// Every action that sends an email (sign-up, "send the link again", forgot password) shares one
// limit: 5 emails per IP, then 1 every 10 minutes.
const emailLimiter = new RateLimiter(5, 1 / 600);

/** Base URL for emailed links (APP_URL, or the public host the visitor used; lib/auth/links.ts). */
async function appOrigin(): Promise<string> {
  return emailLinkOrigin(getConfig().APP_URL, await headers());
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
      if (outcome.kind === "registered") {
        // Already confirmed: tell the inbox owner instead of silently doing nothing.
        await sendMail(alreadyRegisteredMail(outcome.email, await appOrigin(), getConfig().MAIL_FROM_NAME));
      } else {
        await sendVerification(outcome.userId, outcome.email);
      }
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

/** After a confirm/reset link was completed: sign the member in and go to the Pool. */
async function signInAfterLink(email: string): Promise<never> {
  const auth = authSettings();
  if (auth) {
    await startSession(email, "member", auth);
    redirect("/pool");
  }
  redirect("/login");
}

export type ConfirmState = { error?: string; wrongPassword?: boolean };

/**
 * The form on /verify: re-enter the password chosen at sign-up, or (if it doesn't match: forgotten,
 * or someone else signed up with this email) choose a new one. Only then is the link used up.
 */
export async function confirmEmailAction(_prev: ConfirmState, formData: FormData): Promise<ConfirmState> {
  const token = String(formData.get("token") ?? "");
  const newPassword = formData.get("newPassword");
  let result;
  if (newPassword !== null) {
    const valid = validateNewPassword(String(newPassword), String(formData.get("confirm") ?? ""));
    if (!valid.ok) return { error: valid.error, wrongPassword: true };
    result = await completeEmailToken(getDb(), token, "verify_email", { newPassword: String(newPassword) });
  } else {
    result = await completeEmailToken(getDb(), token, "verify_email", {
      currentPassword: String(formData.get("password") ?? ""),
    });
  }
  if (!result.ok) {
    if (result.reason === "wrong_password") {
      return {
        wrongPassword: true,
        error: "That isn't the password this account was created with. Choose a new one below instead.",
      };
    }
    return {
      error: "This link is no longer valid. Sign up again or use “Forgot password” to get a new one.",
    };
  }
  logger.info({ email: result.email }, "email confirmed");
  return signInAfterLink(result.email);
}

export type ForgotState = { sentTo?: string; error?: string };

/** /forgot: always the same answer, so nobody can find out which emails have an account. */
export async function forgotPasswordAction(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email.includes("@")) return { error: "Enter the email you signed up with." };
  const rl = emailLimiter.take(clientIp(await headers()));
  if (!rl.allowed)
    return { error: `Please wait ${Math.ceil(rl.retryAfterSec / 60)} min before asking again.` };

  const help = await passwordHelpFor(getDb(), email);
  if (help) {
    try {
      if (help.kind === "reset") {
        const token = await createEmailToken(getDb(), help.userId, "reset_password");
        const link = `${await appOrigin()}/reset?${new URLSearchParams({ token })}`;
        await sendMail(resetPasswordMail(help.email, link, getConfig().MAIL_FROM_NAME));
      } else {
        await sendVerification(help.userId, help.email);
      }
    } catch (err) {
      logger.error({ err, email: help.email }, "password help email failed");
      return { error: "We couldn't send the email. Try again in a few minutes." };
    }
  }
  logger.info({ email: email.toLowerCase(), sent: help?.kind ?? "nothing" }, "password help");
  return { sentTo: email.toLowerCase() };
}

export type ResetState = { error?: string };

/** /reset: the new password from the emailed link; signs the member in. */
export async function resetPasswordAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const newPassword = String(formData.get("newPassword") ?? "");
  const valid = validateNewPassword(newPassword, String(formData.get("confirm") ?? ""));
  if (!valid.ok) return { error: valid.error };
  const result = await completeEmailToken(getDb(), String(formData.get("token") ?? ""), "reset_password", {
    newPassword,
  });
  if (!result.ok)
    return { error: "This link is no longer valid (links work for 1 hour, once). Ask for a new one." };
  logger.info({ email: result.email }, "password reset");
  return signInAfterLink(result.email);
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}
