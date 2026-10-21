import type { AppConfig } from "../config";
import { addPost, savedTopicsForGeneration } from "../data/saved";
import { nvidiaKeyOf, userModel } from "../data/users";
import type { DB } from "../db/client";
import type { PostPlatform, User } from "../db/schema";
import { nvidiaChat } from "../llm/nvidia";
import { LLMError } from "../llm/types";
import { buildPostPrompt, POST_SYSTEM_PROMPT, type PostLang } from "./prompt";

/** The free NVIDIA endpoints are rate-limited per key: keep one click to a handful of calls. */
export const MAX_POSTS_PER_REQUEST = 10;

export type GenerateResult = { created: number; errors: string[] };

/** Writes one post per selected saved topic with the user's own NVIDIA key and model. */
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

  const result: GenerateResult = { created: 0, errors: [] };
  // One at a time: friendlier to the free endpoint's rate limit; stop early on errors that will repeat
  // (bad key, rate limit, or a busy endpoint that would make the user wait a minute per topic).
  for (const { topic, source } of selected) {
    try {
      const content = await nvidiaChat({
        apiKey,
        model,
        system: POST_SYSTEM_PROMPT,
        prompt: buildPostPrompt(source, opts.platform, opts.lang),
        baseUrl: cfg.NVIDIA_API_BASE_URL,
        timeoutMs: cfg.NVIDIA_TIMEOUT_MS,
      });
      await addPost(db, {
        userId: user.id,
        topicId: topic.id,
        platform: opts.platform,
        lang: opts.lang,
        model,
        content,
      });
      result.created++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${topic.title.slice(0, 60)}: ${msg}`);
      if (
        err instanceof LLMError &&
        (err.kind === "auth" || err.kind === "usage_limit" || err.kind === "timeout")
      )
        break;
    }
  }
  return result;
}
