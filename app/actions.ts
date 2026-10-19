"use server";

// Server actions: the dashboard's only way to change data. Each one calls a lib/ function;
// the web app never runs collection itself, it only queues a job for the worker.
import { revalidatePath } from "next/cache";
import { enqueueJob } from "@/lib/data/jobs";
import { setSourceEnabled } from "@/lib/data/sources";
import { setTopicStatus, TOPIC_STATUSES } from "@/lib/data/topics";
import { getDb } from "@/lib/db/client";
import type { TopicStatus } from "@/lib/db/schema";

export async function runNowAction(): Promise<{ queued: boolean }> {
  const job = await enqueueJob(getDb(), "collect", { trigger: "manual" });
  revalidatePath("/", "layout");
  return { queued: job !== null };
}

export async function setTopicStatusAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const status = String(formData.get("status")) as TopicStatus;
  if (!Number.isInteger(id) || !TOPIC_STATUSES.includes(status)) throw new Error("Invalid input");
  await setTopicStatus(getDb(), id, status);
  revalidatePath("/pool");
  revalidatePath(`/pool/${id}`);
}

export async function toggleSourceAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const enabled = formData.get("enabled") === "true";
  if (!Number.isInteger(id)) throw new Error("Invalid input");
  await setSourceEnabled(getDb(), id, enabled);
  revalidatePath("/sources");
}
