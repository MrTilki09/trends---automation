import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskSecret } from "../lib/auth/secrets";
import {
  DEFAULT_NVIDIA_MODEL,
  isNvidiaModel,
  looksLikeNvidiaKey,
  nvidiaChat,
  stripThinking,
} from "../lib/llm/nvidia";
import { LLMError } from "../lib/llm/types";
import { buildPostPrompt } from "../lib/posts/prompt";

const SECRET = "s".repeat(32);
const KEY = "nvapi-abcdefghijklmnopqrstuvwxyz0123456789";

describe("stored API key encryption", () => {
  it("round-trips and never contains the plain key", () => {
    const enc = encryptSecret(KEY, SECRET);
    expect(enc).toMatch(/^v1\./);
    expect(enc).not.toContain("abcdefghij");
    expect(decryptSecret(enc, SECRET)).toBe(KEY);
    // Random IV: same key encrypts differently each time.
    expect(encryptSecret(KEY, SECRET)).not.toBe(enc);
  });

  it("fails closed with the wrong secret or tampered data", () => {
    const enc = encryptSecret(KEY, SECRET);
    expect(decryptSecret(enc, "t".repeat(32))).toBeNull();
    const parts = enc.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(decryptSecret(parts.join("."), SECRET)).toBeNull();
    expect(decryptSecret("garbage", SECRET)).toBeNull();
  });

  it("masks keys for display", () => {
    expect(maskSecret(KEY)).toBe("nvapi-…6789");
    expect(maskSecret("short")).toBe("••••");
  });
});

describe("NVIDIA client", () => {
  it("validates keys and models", () => {
    expect(looksLikeNvidiaKey(KEY)).toBe(true);
    expect(looksLikeNvidiaKey("sk-123")).toBe(false);
    expect(isNvidiaModel(DEFAULT_NVIDIA_MODEL)).toBe(true);
    expect(isNvidiaModel("some/other-model")).toBe(false);
  });

  it("drops reasoning output", () => {
    expect(stripThinking("<think>hmm</think>\nThe post")).toBe("The post");
    expect(stripThinking("reasoning without opening tag</think> The post")).toBe("The post");
    expect(stripThinking("Just the post")).toBe("Just the post");
  });

  const call = (fetchImpl: typeof fetch) =>
    nvidiaChat({
      apiKey: KEY,
      model: DEFAULT_NVIDIA_MODEL,
      system: "s",
      prompt: "p",
      baseUrl: "https://example.test/v1/",
      timeoutMs: 1000,
      fetchImpl,
    });

  it("sends an OpenAI-style request with the user's key and returns the answer", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return Response.json({ choices: [{ message: { content: "<think>x</think>Hello world" } }] });
    }) as unknown as typeof fetch;
    expect(await call(fake)).toBe("Hello world");
    expect(seen!.url).toBe("https://example.test/v1/chat/completions");
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    // The default (Nemotron) model is sent with its hidden reasoning switched off.
    expect(JSON.parse(seen!.init.body as string)).toMatchObject({
      model: DEFAULT_NVIDIA_MODEL,
      stream: false,
      chat_template_kwargs: { enable_thinking: false },
    });
  });

  it("explains an answer that is only reasoning", async () => {
    const reasoningOnly = (async () =>
      Response.json({
        choices: [{ message: { content: null, reasoning_content: "..." }, finish_reason: "length" }],
      })) as unknown as typeof fetch;
    await expect(call(reasoningOnly)).rejects.toThrow(/reasoning/);
  });

  it("reports a timeout as its own error kind", async () => {
    const hang = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) =>
        init.signal!.addEventListener("abort", () => reject(init.signal!.reason)),
      )) as unknown as typeof fetch;
    await expect(call(hang)).rejects.toMatchObject({ kind: "timeout" });
  });

  it("maps HTTP errors to error kinds", async () => {
    const status = (s: number) =>
      (async () => new Response("nope", { status: s })) as unknown as typeof fetch;
    await expect(call(status(401))).rejects.toMatchObject({ kind: "auth" });
    await expect(call(status(429))).rejects.toMatchObject({ kind: "usage_limit" });
    await expect(call(status(500))).rejects.toBeInstanceOf(LLMError);
    const empty = (async () => Response.json({ choices: [] })) as unknown as typeof fetch;
    await expect(call(empty)).rejects.toMatchObject({ kind: "bad_output" });
  });
});

describe("post prompt", () => {
  it("includes the facts, platform rules and language", () => {
    const prompt = buildPostPrompt(
      {
        title: "OpenAI ships GPT-6",
        url: "https://openai.com/gpt-6",
        summary: "A new model.",
        category: "AI",
        tags: ["launch", "llm"],
        itemTitles: ["OpenAI ships GPT-6", "GPT-6 is here", "GPT-6 is here"],
      },
      "x",
      "tr",
    );
    expect(prompt).toContain("X / Twitter");
    expect(prompt).toContain("Turkish");
    expect(prompt).toContain("Link: https://openai.com/gpt-6");
    expect(prompt).toContain("Summary: A new model.");
    // Related headlines: deduplicated, without the main title.
    expect(prompt.match(/GPT-6 is here/g)).toHaveLength(1);
  });
});
