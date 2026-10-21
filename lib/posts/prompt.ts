import type { PostPlatform } from "../db/schema";

/** What a generated post is written for. */
export const PLATFORMS: Record<PostPlatform, { label: string; instructions: string }> = {
  x: {
    label: "X / Twitter",
    instructions:
      "One post of at most 270 characters. Hook first, no hashtag spam (max 2), include the link.",
  },
  linkedin: {
    label: "LinkedIn",
    instructions:
      "A LinkedIn post of 80-150 words: a strong first line, 2-3 short paragraphs on why it matters, a question to end, the link, up to 3 hashtags.",
  },
  blog: {
    label: "Blog intro",
    instructions:
      "A blog post draft: a title line, then 3-4 short paragraphs (200-300 words) explaining the news and its impact.",
  },
};

export const POST_LANGS = { en: "English", tr: "Turkish" } as const;
export type PostLang = keyof typeof POST_LANGS;

export type PostSource = {
  title: string;
  url: string | null;
  summary: string | null;
  category: string | null;
  tags: string[];
  /** Titles of the individual articles in the topic, for extra context. */
  itemTitles: string[];
};

export const POST_SYSTEM_PROMPT =
  "You are a sharp tech journalist writing social media posts about tech news. " +
  "Be accurate: only use facts given to you, never invent numbers, quotes or details. " +
  'Answer with the post text only: no preamble such as "Here is the post", no quotes around it, ' +
  "no placeholders like [link]; use the real link given.";

export function buildPostPrompt(src: PostSource, platform: PostPlatform, lang: PostLang): string {
  const lines = [
    `Write a ${PLATFORMS[platform].label} post in ${POST_LANGS[lang]} about this news.`,
    PLATFORMS[platform].instructions,
    "",
    `Headline: ${src.title}`,
    src.url ? `Link: ${src.url}` : "Link: (none)",
    src.category ? `Category: ${src.category}` : "",
    src.tags.length ? `Tags: ${src.tags.slice(0, 8).join(", ")}` : "",
    src.summary ? `Summary: ${src.summary}` : "",
  ];
  const related = [...new Set(src.itemTitles.filter((t) => t !== src.title))].slice(0, 6);
  if (related.length) lines.push("Related headlines from other sources:", ...related.map((t) => `- ${t}`));
  return lines.filter((l) => l !== "").join("\n");
}
