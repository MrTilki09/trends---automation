import { z } from "zod";

/**
 * All environment configuration, validated with zod.
 * Call getConfig() (not process.env) everywhere so a bad value fails fast with a clear message.
 */

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .default("false")
  .transform((v) => v === "true" || v === "1");

const csv = z
  .string()
  .default("")
  .transform((v) =>
    v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  TZ: z.string().default("Europe/Istanbul"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  COLLECT_CRON: z.string().default("0 7,13,19 * * *"),
  CLEANUP_CRON: z.string().default("30 3 * * *"),
  SOURCE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  CLUSTER_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.55),
  CLUSTER_WINDOW_HOURS: z.coerce.number().positive().default(72),
  SCORE_HALF_LIFE_HOURS: z.coerce.number().positive().default(24),
  RAW_ITEM_RETENTION_DAYS: z.coerce.number().int().positive().default(30),

  NICHE_DESCRIPTION: z.string().default(""),
  NICHE_KEYWORDS: csv,

  LLM_PROVIDER: z.enum(["claude-cli", "anthropic-api", "openai-compatible"]).default("claude-cli"),
  LLM_ENRICH_ENABLED: bool,
  LLM_ENRICH_TOP_N: z.coerce.number().int().positive().default(30),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  LLM_MODEL: z.string().optional(),
  CLAUDE_CODE_OAUTH_TOKEN: z.string().optional(),

  REDDIT_CLIENT_ID: z.string().optional(),
  REDDIT_CLIENT_SECRET: z.string().optional(),
  REDDIT_USERNAME: z.string().optional(),
  REDDIT_PASSWORD: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | undefined;

export function getConfig(): AppConfig {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
