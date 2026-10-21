import pino from "pino";

/** Structured JSON logs to stdout. Docker collects them; view with `npm run logs`. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: process.env.SERVICE_NAME ?? "app" },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Never print secrets even if someone logs a whole config/env object.
  redact: {
    paths: [
      "CLAUDE_CODE_OAUTH_TOKEN",
      "*.CLAUDE_CODE_OAUTH_TOKEN",
      "REDDIT_CLIENT_SECRET",
      "*.REDDIT_CLIENT_SECRET",
      "REDDIT_PASSWORD",
      "REDDIT_DEVVIT_TOKEN",
      "*.REDDIT_DEVVIT_TOKEN",
      "*.REDDIT_PASSWORD",
      "DATABASE_URL",
      "*.DATABASE_URL",
    ],
    censor: "[redacted]",
  },
});

export type Logger = pino.Logger;
