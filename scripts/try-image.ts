/**
 * Try Cloudflare image generation from the command line (uses CLOUDFLARE_* from .env):
 *
 *   npx tsx --env-file=.env scripts/try-image.ts                 # built-in news-cover test prompt
 *   npx tsx --env-file=.env scripts/try-image.ts "a cat" 1024 1024
 *
 * Saves the image to generated/ (git-ignored) and prints its path, size and neuron cost.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateImage, klein9bNeurons } from "../lib/images/cloudflare";

const SAMPLE =
  "High-detail 3D isometric tilt-shift render of a modern hyperscale data center campus on the outskirts of " +
  "Ankara at golden hour, rows of server halls with rooftop cooling units, a substation with power lines, " +
  "tiny trucks and workers, vibrant clean lighting, photorealistic materials. Bottom 40% dark black gradient " +
  'overlay. Large bold condensed sans-serif ALL CAPS headline centered in the lower third reading ' +
  '"ANKARA\'YA 4,1 MİLYAR DOLARLIK DEV VERİ MERKEZİ", the words "4,1 MİLYAR DOLARLIK" in neon lime green ' +
  '(#C6F432), the rest white. Smaller white subheadline below reading "İlk etapta 450 milyon dolar, 22 megavat". ' +
  'Small "trendpool" watermark at bottom center. Clean editorial news-cover typography, crisp legible text, ' +
  "correct spelling, no other text.";

async function main() {
  const [prompt = SAMPLE, w = "1024", h = "1280"] = process.argv.slice(2);
  const width = Number(w);
  const height = Number(h);
  const t0 = Date.now();
  const { bytes, model } = await generateImage({ prompt, width, height });
  await mkdir("generated", { recursive: true });
  const ext = bytes[0] === 0xff ? "jpg" : "png";
  const file = path.join("generated", `test-${Date.now()}.${ext}`);
  await writeFile(file, bytes);
  console.log(
    JSON.stringify({
      file,
      model,
      size: `${width}x${height}`,
      kb: Math.round(bytes.length / 1024),
      seconds: ((Date.now() - t0) / 1000).toFixed(1),
      neuronsEstimate: Math.round(klein9bNeurons(width, height)),
      freeImagesPerDayEstimate: Math.floor(10_000 / klein9bNeurons(width, height)),
    }),
  );
}

main().catch((err) => {
  console.error(`Image generation failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
