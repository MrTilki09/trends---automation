import { LLMError } from "./types";

/*
 * NVIDIA API Catalog (build.nvidia.com): OpenAI-compatible chat completions with a personal
 * `nvapi-…` key. Free "preview" endpoints are rate-limited per key; nothing is billed.
 * Each user brings their own key (stored encrypted, see lib/data/users.ts).
 */

/**
 * Text models from the free-endpoint list (checked October 2026). First = default.
 * Measured with a real key: Nemotron 3.5 Lightning answers in ~2 s; the free DeepSeek/Gemma
 * endpoints were queued (no first token within 75 s), so they are opt-in only.
 * `body` = extra request fields: Nemotron reasons by default and can spend the whole token budget on
 * hidden reasoning (empty answer), so its thinking is switched off.
 */
export const NVIDIA_MODELS = [
  {
    id: "nvidia/nemotron-3.5-lightning-30b-a3b",
    label: "Nemotron 3.5 Lightning (recommended: answers in seconds)",
    body: { chat_template_kwargs: { enable_thinking: false } },
  },
  {
    id: "deepseek-ai/deepseek-v4.1-flash",
    label: "DeepSeek V4.1 Flash (better writing, but the free endpoint is often queued)",
    body: {},
  },
  { id: "google/gemma-4-31b-it", label: "Gemma 4 31B (often queued on the free tier)", body: {} },
] as const;

const extraBody = (model: string): Record<string, unknown> =>
  NVIDIA_MODELS.find((m) => m.id === model)?.body ?? {};

export type NvidiaModelId = (typeof NVIDIA_MODELS)[number]["id"];
export const DEFAULT_NVIDIA_MODEL: NvidiaModelId = NVIDIA_MODELS[0].id;
export const isNvidiaModel = (id: unknown): id is NvidiaModelId => NVIDIA_MODELS.some((m) => m.id === id);

export const looksLikeNvidiaKey = (key: string) => /^nvapi-[\w-]{20,}$/.test(key);

/** Reasoning models may put their thinking inline; only the answer is kept. */
export function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^[\s\S]*<\/think>/i, "")
    .trim();
}

export async function nvidiaChat(opts: {
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  baseUrl: string;
  timeoutMs: number;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const res = await (opts.fetchImpl ?? fetch)(`${opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.prompt },
      ],
      temperature: 0.7,
      max_tokens: opts.maxTokens ?? 1200,
      stream: false,
      ...extraBody(opts.model),
    }),
    signal: AbortSignal.timeout(opts.timeoutMs),
  }).catch((err: unknown) => {
    const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new LLMError(
      timeout ? "timeout" : "other",
      timeout
        ? `NVIDIA did not answer within ${Math.round(opts.timeoutMs / 1000)} s (the free endpoint for this model is probably busy; try another model in Settings)`
        : `NVIDIA API unreachable: ${String(err)}`,
    );
  });

  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 300);
    if (res.status === 401 || res.status === 403)
      throw new LLMError("auth", "NVIDIA rejected the API key (401/403)");
    if (res.status === 429)
      throw new LLMError("usage_limit", "NVIDIA rate limit reached, try again in a minute");
    throw new LLMError("other", `NVIDIA API error ${res.status}: ${body}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  };
  const text = stripThinking(json.choices?.[0]?.message?.content ?? "");
  if (!text) {
    const cutOff = json.choices?.[0]?.finish_reason === "length";
    throw new LLMError(
      "bad_output",
      cutOff
        ? "NVIDIA returned no text: the model used its whole token budget on reasoning"
        : "NVIDIA returned an empty answer",
    );
  }
  return text;
}
