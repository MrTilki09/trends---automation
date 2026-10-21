"use server";

// Server actions for a signed-in user's own data: Saved topics, generated posts, NVIDIA settings.
// Each one resolves the user from the session cookie itself (localhost access is not enough) and
// every lib/ call is scoped to that user's id.
import { revalidatePath } from "next/cache";
import { assertSignedInUser } from "@/lib/auth/server";
import { getConfig } from "@/lib/config";
import { deletePost, saveTopic, unsaveTopic } from "@/lib/data/saved";
import { clearNvidiaKey, setBrandName, setNvidiaKey, setNvidiaModel } from "@/lib/data/users";
import { getDb } from "@/lib/db/client";
import type { PostPlatform } from "@/lib/db/schema";
import { isNvidiaModel, looksLikeNvidiaKey } from "@/lib/llm/nvidia";
import { logger } from "@/lib/logger";
import { generatePosts, type GenerateResult } from "@/lib/posts/generate";
import { PLATFORMS, POST_LANGS, type PostLang } from "@/lib/posts/prompt";

const intOf = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error("Invalid input");
  return n;
};

export async function toggleSavedAction(formData: FormData): Promise<void> {
  const user = await assertSignedInUser();
  const topicId = intOf(formData.get("id"));
  if (formData.get("saved") === "true") await saveTopic(getDb(), user.id, topicId);
  else await unsaveTopic(getDb(), user.id, topicId);
  revalidatePath("/pool");
  revalidatePath(`/pool/${topicId}`);
  revalidatePath("/saved");
}

export type GenerateState = GenerateResult & { done?: boolean };

export async function generatePostsAction(_prev: GenerateState, formData: FormData): Promise<GenerateState> {
  const user = await assertSignedInUser();
  const topicIds = formData.getAll("topicId").map(intOf);
  const platform = String(formData.get("platform")) as PostPlatform;
  const lang = String(formData.get("lang")) as PostLang;
  if (!(platform in PLATFORMS) || !(lang in POST_LANGS)) throw new Error("Invalid input");
  if (!topicIds.length) return { created: 0, errors: ["Select at least one saved topic."], done: true };

  const result = await generatePosts(getDb(), getConfig(), user, { topicIds, platform, lang });
  if (result.errors.length) logger.warn({ userId: user.id, errors: result.errors }, "post generation errors");
  revalidatePath("/saved");
  return { ...result, done: true };
}

export async function deletePostAction(formData: FormData): Promise<void> {
  const user = await assertSignedInUser();
  await deletePost(getDb(), user.id, intOf(formData.get("id")));
  revalidatePath("/saved");
}

export type SettingsState = { message?: string; error?: string };

export async function saveNvidiaSettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await assertSignedInUser();
  const db = getDb();
  const model = formData.get("model");
  if (isNvidiaModel(model)) await setNvidiaModel(db, user.id, model);
  if (formData.has("brand")) await setBrandName(db, user.id, String(formData.get("brand")));

  const apiKey = String(formData.get("apiKey") ?? "").trim();
  if (apiKey) {
    if (!looksLikeNvidiaKey(apiKey))
      return { error: "That doesn't look like an NVIDIA key (it starts with nvapi-)." };
    const secretsKey = getConfig().SECRETS_KEY;
    if (!secretsKey)
      return { error: "The server has no SECRETS_KEY set, so keys can't be stored safely (README §5c)." };
    await setNvidiaKey(db, user.id, apiKey, secretsKey);
  }
  revalidatePath("/settings");
  return { message: apiKey ? "Key and settings saved." : "Settings saved." };
}

export async function clearNvidiaKeyAction(): Promise<void> {
  const user = await assertSignedInUser();
  await clearNvidiaKey(getDb(), user.id);
  revalidatePath("/settings");
}
