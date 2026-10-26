/**
 * Image generation through Cloudflare Workers AI (free: 10,000 "neurons" per day per account).
 *
 * Default model: FLUX.2 [klein] 9B. Its price is 1,363.64 neurons for the first megapixel plus
 * 181.82 per extra megapixel, so a 1024×1280 (4:5) image costs ≈ 1,409 neurons → about 7 free
 * images per day. Smaller/cheaper alternative: "@cf/black-forest-labs/flux-2-klein-4b" (~60/day).
 *
 * Env (from the Cloudflare dashboard):
 *   CLOUDFLARE_ACCOUNT_ID  Account ID (Workers & Pages → Overview, right sidebar)
 *   CLOUDFLARE_API_TOKEN   API token with the "Workers AI" permission (Read is enough to run models)
 *   CLOUDFLARE_IMAGE_MODEL optional, defaults to FLUX.2 klein 9B
 */

export const DEFAULT_IMAGE_MODEL = "@cf/black-forest-labs/flux-2-klein-9b";

export type ImageRequest = {
  prompt: string;
  /** Pixels; FLUX.2 wants multiples of 16. Defaults to 1024×1280 (4:5 portrait). */
  width?: number;
  height?: number;
  seed?: number;
  model?: string;
  signal?: AbortSignal;
};

export class ImageGenError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "ImageGenError";
  }
}

/** Neurons one image costs on klein 9B (for showing "x of your daily free images"). */
export function klein9bNeurons(width: number, height: number): number {
  const mp = (width * height) / (1024 * 1024);
  return 1363.64 + Math.max(0, mp - 1) * 181.82;
}

const round16 = (n: number) => Math.max(256, Math.round(n / 16) * 16);

/** Generates one image and returns PNG/JPEG bytes. */
export async function generateImage(req: ImageRequest): Promise<{ bytes: Buffer; model: string }> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) {
    throw new ImageGenError("CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN are not set (see README).");
  }
  const model = req.model ?? process.env.CLOUDFLARE_IMAGE_MODEL ?? DEFAULT_IMAGE_MODEL;

  // FLUX.2 models on Workers AI take a multipart form.
  const form = new FormData();
  form.append("prompt", req.prompt);
  form.append("width", String(round16(req.width ?? 1024)));
  form.append("height", String(round16(req.height ?? 1280)));
  if (req.seed != null) form.append("seed", String(req.seed));

  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal: req.signal ?? AbortSignal.timeout(120_000),
  });

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.startsWith("image/")) {
    if (!res.ok) throw new ImageGenError(`Cloudflare returned HTTP ${res.status}`, res.status);
    return { bytes: Buffer.from(await res.arrayBuffer()), model };
  }

  const body = (await res.json().catch(() => null)) as {
    success?: boolean;
    result?: { image?: string };
    errors?: { code?: number; message?: string }[];
  } | null;
  if (!res.ok || !body?.success || !body.result?.image) {
    const msg = body?.errors?.map((e) => `${e.code ?? ""} ${e.message ?? ""}`.trim()).join("; ");
    // 4006 = daily free allocation used up (resets 00:00 UTC).
    throw new ImageGenError(msg || `Cloudflare returned HTTP ${res.status}`, res.status);
  }
  return { bytes: Buffer.from(body.result.image, "base64"), model };
}
