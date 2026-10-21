"use server";

// Server actions: the dashboard's only way to change data. Each one calls a lib/ function;
// the web app never runs collection itself, it only queues a job for the worker.
// Server actions are public POST endpoints: every one except login checks the viewer itself.
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkLogin } from "@/lib/auth/login";
import { assertViewer, authSettings, endSession, startSession } from "@/lib/auth/server";
import { safeNextPath } from "@/lib/auth/session";
import { createApiKey, revokeApiKey } from "@/lib/data/api-keys";
import { enqueueJob } from "@/lib/data/jobs";
import { setSourceEnabled } from "@/lib/data/sources";
import { setTopicStatus, TOPIC_STATUSES } from "@/lib/data/topics";
import { getDb } from "@/lib/db/client";
import type { TopicStatus } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { clientIp } from "@/lib/util/rate-limit";

export async function runNowAction(): Promise<{ queued: boolean }> {
  await assertViewer();
  const job = await enqueueJob(getDb(), "collect", { trigger: "manual" });
  revalidatePath("/", "layout");
  return { queued: job !== null };
}

export async function setTopicStatusAction(formData: FormData): Promise<void> {
  await assertViewer();
  const id = Number(formData.get("id"));
  const status = String(formData.get("status")) as TopicStatus;
  if (!Number.isInteger(id) || !TOPIC_STATUSES.includes(status)) throw new Error("Invalid input");
  await setTopicStatus(getDb(), id, status);
  revalidatePath("/pool");
  revalidatePath(`/pool/${id}`);
}

export async function toggleSourceAction(formData: FormData): Promise<void> {
  await assertViewer();
  const id = Number(formData.get("id"));
  const enabled = formData.get("enabled") === "true";
  if (!Number.isInteger(id)) throw new Error("Invalid input");
  await setSourceEnabled(getDb(), id, enabled);
  revalidatePath("/sources");
}

export type CreateKeyState = { key?: string; name?: string; error?: string };

export async function createApiKeyAction(_prev: CreateKeyState, formData: FormData): Promise<CreateKeyState> {
  await assertViewer();
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, 80);
  if (!name) return { error: "Give the key a name (e.g. which app uses it)." };
  const { key } = await createApiKey(getDb(), name);
  revalidatePath("/keys");
  return { key, name };
}

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  await assertViewer();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) throw new Error("Invalid input");
  await revokeApiKey(getDb(), id);
  revalidatePath("/keys");
}

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const ip = clientIp(await headers());
  const user = String(formData.get("user") ?? "");
  const auth = authSettings();
  const result = await checkLogin({ user, password: String(formData.get("password") ?? ""), ip }, auth);
  if (!result.ok) {
    logger.warn({ ip, user, reason: result.error }, "dashboard login failed");
    return { error: result.error };
  }
  await startSession(user, auth!);
  redirect(safeNextPath(formData.get("next")));
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}
