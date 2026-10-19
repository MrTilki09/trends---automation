import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { z } from "zod";
import { LLMError, type LLMCompleteInput, type LLMErrorKind, type LLMProvider } from "./types";

/*
 * Runs the official Claude Code CLI in print mode:  claude -p --output-format json --max-turns 1
 * The prompt goes through stdin (argv has length and escaping limits).
 * Auth: CLAUDE_CODE_OAUTH_TOKEN env var (create it with `claude setup-token` on your own machine).
 * Personal use only — see README "Subscription policy".
 */

const resultSchema = z.object({
  type: z.string().optional(),
  subtype: z.string().optional(),
  is_error: z.boolean().optional(),
  result: z.string().optional(),
  api_error_status: z.number().nullable().optional(),
});

/** Only one CLI call at a time, to protect the subscription's usage limits. */
let queue: Promise<unknown> = Promise.resolve();
function withMutex<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

export function classifyCliError(text: string): LLMErrorKind {
  const t = text.toLowerCase();
  if (/usage limit|rate limit|limit reached|too many requests|quota/.test(t)) return "usage_limit";
  if (
    /invalid api key|unauthorized|authenticat|oauth|not logged in|please run \/login|401|403|token (has )?expired|invalid token/.test(
      t,
    )
  )
    return "auth";
  return "other";
}

export type SpawnFn = typeof spawn;

export function createClaudeCliProvider(
  opts: { model?: string; spawnFn?: SpawnFn; bin?: string } = {},
): LLMProvider {
  const spawnFn = opts.spawnFn ?? spawn;
  const bin = opts.bin ?? process.env.CLAUDE_BIN ?? "claude";

  return {
    name: "claude-cli",
    complete(input: LLMCompleteInput) {
      return withMutex(() => runOnce(input));
    },
  };

  function runOnce(input: LLMCompleteInput): Promise<{ text: string; raw?: unknown }> {
    // --tools "" disables every tool: we only want text back. Never --dangerously-skip-permissions.
    const args = [
      "-p",
      "--output-format",
      "json",
      "--max-turns",
      "1",
      "--tools",
      "",
      "--no-session-persistence",
    ];
    if (input.system) args.push("--system-prompt", input.system);
    if (opts.model) args.push("--model", opts.model);
    const timeoutMs = input.timeoutMs ?? 120_000;

    return new Promise((resolve, reject) => {
      // Run in the temp dir so the CLI doesn't pick up project files / CLAUDE.md.
      const child = spawnFn(bin, args, { cwd: tmpdir(), env: process.env, stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const done = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        done(() => reject(new LLMError("timeout", `claude CLI timed out after ${timeoutMs} ms`)));
      }, timeoutMs);

      child.stdout?.on("data", (d: Buffer) => (stdout += d.toString()));
      child.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
      child.on("error", (err: NodeJS.ErrnoException) =>
        done(() =>
          reject(
            err.code === "ENOENT"
              ? new LLMError(
                  "not_installed",
                  `claude CLI not found ("${bin}"). Is it installed in this image?`,
                )
              : new LLMError("other", err.message),
          ),
        ),
      );
      child.on("close", (code: number | null) =>
        done(() => {
          let parsed: z.infer<typeof resultSchema> | undefined;
          try {
            parsed = resultSchema.parse(JSON.parse(stdout.trim()));
          } catch {
            parsed = undefined;
          }
          if (parsed && !parsed.is_error && parsed.result != null) {
            return resolve({ text: parsed.result, raw: parsed });
          }
          // Keep the error short and never include env/token values (we only echo CLI output).
          const detail = (parsed?.result ?? stderr ?? stdout).trim().slice(0, 500) || `exit code ${code}`;
          const status = parsed?.api_error_status;
          const kind =
            status === 401 || status === 403
              ? "auth"
              : status === 429
                ? "usage_limit"
                : classifyCliError(detail);
          reject(new LLMError(kind, `claude CLI failed: ${detail}`));
        }),
      );

      child.stdin?.end(input.prompt);
    });
  }
}
