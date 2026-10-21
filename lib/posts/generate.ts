import type { AppConfig } from "../config";
import { addPost, savedTopicsForGeneration } from "../data/saved";
import { nvidiaKeyOf, userBrand, userModel } from "../data/users";
import type { DB } from "../db/client";
import type { PostPlatform, User } from "../db/schema";
import { nvidiaChat } from "../llm/nvidia";
import { LLMError } from "../llm/types";
import { fetchArticle } from "./article";
import {
  buildImagePromptsPrompt,
  buildPostPrompt,
  countSlides,
  finalizeImagePack,
  IMAGE_SYSTEM_PROMPT,
  POST_SYSTEM_PROMPT,
  type PostLang,
} from "./prompt";

/** The free NVIDIA endpoints are rate-limited per key: keep one click to a handful of calls. */
export const MAX_POSTS_PER_REQUEST = 10;

export type GenerateResult = { created: number; errors: string[]; topicIds?: number[] };

/** Errors that will repeat for every topic: stop the batch instead of waiting on each one. */
const isFatal = (err: unknown) =>
  err instanceof LLMError && (err.kind === "auth" || err.kind === "usage_limit" || err.kind === "timeout");

/**
 * For each selected saved topic: fetches the story's page for real facts, writes the post, then an
 * image prompt pack for a carousel (both with the user's own NVIDIA key and model). The post is kept
 * even if the image prompts fail.
 */
export async function generatePosts(
  db: DB,
  cfg: AppConfig,
  user: User,
  opts: { topicIds: number[]; platform: PostPlatform; lang: PostLang },
): Promise<GenerateResult> {
  const apiKey = nvidiaKeyOf(user, cfg.SECRETS_KEY);
  if (!apiKey) return { created: 0, errors: ["Add your NVIDIA API key in Settings first."] };
  const model = userModel(user);
  const selected = await savedTopicsForGeneration(db, user.id, opts.topicIds.slice(0, MAX_POSTS_PER_REQUEST));
  const chat = (system: string, prompt: string, maxTokens?: number) =>
    nvidiaChat({
      apiKey,
      model,
      system,
      prompt,
      maxTokens,
      baseUrl: cfg.NVIDIA_API_BASE_URL,
      timeoutMs: cfg.NVIDIA_TIMEOUT_MS,
    });

  const result: GenerateResult = { created: 0, errors: [], topicIds: [] };
  // One topic at a time: friendlier to the free endpoint's rate limit.
  for (const { topic, source } of selected) {
    const label = topic.title.slice(0, 60);
    const pageUrl = source.url ?? source.items.find((i) => i.url)?.url;
    const story = { ...source, article: pageUrl ? await fetchArticle(pageUrl) : null };

    let content: string;
    try {
      content = await chat(POST_SYSTEM_PROMPT, buildPostPrompt(story, opts.platform, opts.lang));
    } catch (err) {
      result.errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
      if (isFatal(err)) break;
      continue;
    }

    let imagePrompts: string | null = null;
    try {
      const pack = finalizeImagePack(
        await chat(IMAGE_SYSTEM_PROMPT, buildImagePromptsPrompt(story, opts.platform, opts.lang), 3500),
        opts.platform,
        opts.lang,
        userBrand(user),
      );
      imagePrompts = countSlides(pack) > 0 ? pack : null;
      if (!imagePrompts) result.errors.push(`${label}: the image prompts came back in the wrong format`);
    } catch (err) {
      result.errors.push(
        `${label}: image prompts failed (${err instanceof Error ? err.message : String(err)})`,
      );
    }

    await addPost(db, {
      userId: user.id,
      topicId: topic.id,
      platform: opts.platform,
      lang: opts.lang,
      model,
      content,
      imagePrompts,
    });
    result.created++;
    result.topicIds!.push(topic.id);
  }
  return result;
}
