"use server";

// Server actions for a signed-in user's own data: Saved topics, generated posts, NVIDIA settings,
// and the profile (password, deleting the account).
// Each one resolves the user from the session cookie itself (localhost access is not enough) and
// every lib/ call is scoped to that user's id.
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { validateNewPassword } from "@/lib/auth/accounts";
import { assertSignedInUser, endSession } from "@/lib/auth/server";
import { getConfig } from "@/lib/config";
import { deletePost, saveTopic, unsaveTopic } from "@/lib/data/saved";
import {
  changeMemberPassword,
  clearNvidiaKey,
  deleteMemberAccount,
  setBrandName,
  setNvidiaKey,
  setNvidiaModel,
} from "@/lib/data/users";
import { getDb } from "@/lib/db/client";
import type { PostPlatform } from "@/lib/db/schema";
import { isNvidiaModel, looksLikeNvidiaKey } from "@/lib/llm/nvidia";
import { logger } from "@/lib/logger";
import { generatePosts, type GenerateResult } from "@/lib/posts/generate";
import { PLATFORMS, POST_LANGS, type PostLang } from "@/lib/posts/prompt";
import { sharedOnce } from "@/lib/util/once";
import { clientIp, RateLimiter } from "@/lib/util/rate-limit";

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

// Each Generate click carries a unique requestId (see GeneratePostsPanel). A browser, extension or
// proxy (e.g. a Cloudflare Tunnel) can re-send a slow POST; every copy of the same click then gets
// the first result instead of writing the posts again. Remembered for 30 minutes.
const generateOnce = sharedOnce<GenerateResult>("generate-posts", 30 * 60_000);
const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

export async function generatePostsAction(_prev: GenerateState, formData: FormData): Promise<GenerateState> {
  const user = await assertSignedInUser();
  const topicIds = formData.getAll("topicId").map(intOf);
  const platform = String(formData.get("platform")) as PostPlatform;
  const lang = String(formData.get("lang")) as PostLang;
  if (!(platform in PLATFORMS) || !(lang in POST_LANGS)) throw new Error("Invalid input");
  if (!topicIds.length) return { created: 0, errors: ["Select at least one saved topic."], done: true };

  // Pages loaded before this change send no requestId: fall back to the request's content, so a
  // re-sent copy is still caught (a genuine repeat of the exact same selection then waits 30 min).
  const requestId = String(formData.get("requestId") ?? "");
  const key = REQUEST_ID.test(requestId)
    ? `${user.id}:${requestId}`
    : `${user.id}:${platform}:${lang}:${[...topicIds].sort((a, b) => a - b).join(",")}`;

  const { value: result, replayed } = await generateOnce.run(key, () =>
    generatePosts(getDb(), getConfig(), user, { topicIds, platform, lang }),
  );
  if (replayed) {
    // Log where duplicates come from, so the sender can be identified (cf-ray = Cloudflare).
    const h = await headers();
    logger.warn(
      {
        userId: user.id,
        requestId: requestId || null,
        cfRay: h.get("cf-ray"),
        forwardedFor: h.get("x-forwarded-for"),
        userAgent: h.get("user-agent"),
      },
      "duplicate generate request: returned the earlier result, nothing generated",
    );
  } else if (result.errors.length) {
    logger.warn({ userId: user.id, errors: result.errors }, "post generation errors");
  }
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

// Password checks on the profile page get the same limit as sign-in: 5 tries, then 1 per minute.
const passwordCheckLimiter = new RateLimiter(5, 1 / 60);

export type ProfileState = { message?: string; error?: string };

export async function changePasswordAction(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await assertSignedInUser();
  const rl = passwordCheckLimiter.take(clientIp(await headers()));
  if (!rl.allowed) return { error: `Too many attempts. Try again in ${rl.retryAfterSec} s.` };
  const next = String(formData.get("newPassword") ?? "");
  const valid = validateNewPassword(next, String(formData.get("confirm") ?? ""));
  if (!valid.ok) return { error: valid.error };
  const result = await changeMemberPassword(getDb(), user, String(formData.get("current") ?? ""), next);
  if (!result.ok) return { error: result.error };
  logger.info({ userId: user.id }, "password changed");
  return { message: "Password changed." };
}

export async function deleteAccountAction(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await assertSignedInUser();
  if (
    String(formData.get("confirmText") ?? "")
      .trim()
      .toUpperCase() !== "DELETE"
  ) {
    return { error: "Type DELETE to confirm." };
  }
  const rl = passwordCheckLimiter.take(clientIp(await headers()));
  if (!rl.allowed) return { error: `Too many attempts. Try again in ${rl.retryAfterSec} s.` };
  const result = await deleteMemberAccount(getDb(), user, String(formData.get("password") ?? ""));
  if (!result.ok) return { error: result.error };
  logger.info({ userId: user.id }, "account deleted");
  await endSession();
  redirect("/pool");
}
