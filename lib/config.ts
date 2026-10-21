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

// Unset or empty → undefined.
const optionalString = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined));

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

  // Public API (/api/topics)
  API_CACHE_SECONDS: z.coerce.number().int().min(0).max(3600).default(60),
  API_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(60),

  // Dashboard login (web only). All three must be set, otherwise every login is refused (fail closed).
  DASHBOARD_USER: optionalString,
  DASHBOARD_PASSWORD_HASH: optionalString.pipe(
    z
      .string()
      .regex(/^scrypt\.[\w-]+\.[\w-]+$/, "generate it with: node scripts/hash-password.mjs")
      .optional(),
  ),
  SESSION_SECRET: optionalString.pipe(z.string().min(32, "use at least 32 random characters").optional()),
  SESSION_MAX_AGE_DAYS: z.coerce.number().positive().default(30),
  // Encrypts users' stored API keys (NVIDIA). Required to save one.
  SECRETS_KEY: optionalString.pipe(z.string().min(32, "use at least 32 random characters").optional()),
  // Public base URL used in emailed links; falls back to the request's host (README §5d).
  APP_URL: z
    .url()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  // Outgoing email (signup verification). Same names as Laravel's MAIL_* settings.
  MAIL_HOST: optionalString,
  MAIL_PORT: z.coerce.number().int().positive().default(587),
  MAIL_USERNAME: optionalString,
  MAIL_PASSWORD: optionalString,
  MAIL_ENCRYPTION: z.enum(["tls", "ssl", "none", ""]).default("tls"),
  MAIL_FROM_ADDRESS: optionalString,
  MAIL_FROM_NAME: z.string().default("Trend Pool"),
  NVIDIA_API_BASE_URL: z.url().default("https://integrate.api.nvidia.com/v1"),
  NVIDIA_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  // Requests to http://localhost:3000 on the server itself skip login and API keys (lib/auth/local.ts).
  AUTH_LOCALHOST_BYPASS: z
    .enum(["true", "false", "1", "0", ""])
    .default("true")
    .transform((v) => v !== "false" && v !== "0"),

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
  // Reddit via our Devvit app (reddit-bridge/)
  REDDIT_DEVVIT_URL: z
    .url()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  REDDIT_DEVVIT_TOKEN: z.string().optional(),
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
