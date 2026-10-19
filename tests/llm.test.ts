import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { classifyCliError, createClaudeCliProvider, type SpawnFn } from "../lib/llm/claude-cli";
import { LLMError, type LLMProvider } from "../lib/llm/types";
import { buildEnrichPrompt, parseEnrichment } from "../lib/pipeline/enrich";

/** Fake child process: records stdin and replies with the given stdout/exit code. */
function fakeSpawn(reply: { stdout?: string; stderr?: string; code?: number; hang?: boolean }) {
  const calls: { bin: string; args: string[]; stdin: string }[] = [];
  const spawnFn = ((bin: string, args: string[]) => {
    const child = new EventEmitter() as EventEmitter & {
      stdin: PassThrough;
      stdout: PassThrough;
      stderr: PassThrough;
      kill: () => boolean;
    };
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => true;
    const call = { bin, args, stdin: "" };
    calls.push(call);
    child.stdin.on("data", (d) => (call.stdin += d.toString()));
    child.stdin.on("finish", () => {
      if (reply.hang) return;
      setImmediate(() => {
        if (reply.stdout) child.stdout.write(reply.stdout);
        if (reply.stderr) child.stderr.write(reply.stderr);
        child.emit("close", reply.code ?? 0);
      });
    });
    return child;
  }) as unknown as SpawnFn;
  return { spawnFn, calls };
}

describe("claude-cli provider", () => {
  it("passes the prompt via stdin and reads `result` from JSON output", async () => {
    const { spawnFn, calls } = fakeSpawn({
      stdout: JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "hello" }),
    });
    const p = createClaudeCliProvider({ spawnFn });
    const res = await p.complete({ prompt: "Say hello", system: "Be brief" });
    expect(res.text).toBe("hello");
    expect(calls[0]!.stdin).toBe("Say hello");
    expect(calls[0]!.args).toEqual(
      expect.arrayContaining(["-p", "--output-format", "json", "--max-turns", "1"]),
    );
    expect(calls[0]!.args.join(" ")).not.toContain("Say hello");
    expect(calls[0]!.args).not.toContain("--dangerously-skip-permissions");
  });

  it("surfaces auth errors with a category", async () => {
    const { spawnFn } = fakeSpawn({
      stdout: JSON.stringify({
        type: "result",
        is_error: true,
        result: "Invalid API key · Please run /login",
      }),
      code: 1,
    });
    await expect(createClaudeCliProvider({ spawnFn }).complete({ prompt: "x" })).rejects.toMatchObject({
      kind: "auth",
    });
  });

  it("classifies the real CLI output for an invalid token as auth", async () => {
    // Shape captured from `claude -p --output-format json` 2.1.303 with a bad CLAUDE_CODE_OAUTH_TOKEN.
    const { spawnFn } = fakeSpawn({
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: true,
        api_error_status: 401,
        result: "Failed to authenticate. API Error: 401 Invalid bearer token",
      }),
      code: 1,
    });
    await expect(createClaudeCliProvider({ spawnFn }).complete({ prompt: "x" })).rejects.toMatchObject({
      kind: "auth",
      message: expect.stringContaining("Invalid bearer token"),
    });
  });

  it("kills the process on timeout", async () => {
    const { spawnFn } = fakeSpawn({ hang: true });
    await expect(
      createClaudeCliProvider({ spawnFn }).complete({ prompt: "x", timeoutMs: 50 }),
    ).rejects.toMatchObject({
      kind: "timeout",
    });
  });

  it("runs one call at a time", async () => {
    let active = 0;
    let maxActive = 0;
    const { spawnFn: inner } = fakeSpawn({ stdout: JSON.stringify({ result: "ok" }) });
    const spawnFn = ((...args: Parameters<SpawnFn>) => {
      active++;
      maxActive = Math.max(maxActive, active);
      const child = inner(...args);
      child.on("close", () => active--);
      return child;
    }) as SpawnFn;
    const p = createClaudeCliProvider({ spawnFn });
    await Promise.all([
      p.complete({ prompt: "a" }),
      p.complete({ prompt: "b" }),
      p.complete({ prompt: "c" }),
    ]);
    expect(maxActive).toBe(1);
  });

  it("classifies usage-limit messages", () => {
    expect(classifyCliError("Claude AI usage limit reached|1760000000")).toBe("usage_limit");
    expect(classifyCliError("OAuth token has expired")).toBe("auth");
    expect(classifyCliError("something odd")).toBe("other");
  });
});

describe("enrichment parsing (mocked provider)", () => {
  const mock = (text: string): LLMProvider => ({ name: "mock", complete: async () => ({ text }) });

  it("builds a prompt with niche and topic ids", () => {
    const prompt = buildEnrichPrompt("AI news", [{ id: 7, title: "GPT-6", keywords: ["gpt"] }]);
    expect(prompt).toContain("AI news");
    expect(prompt).toContain('"id":7');
  });

  it("parses strict JSON, even inside code fences", async () => {
    const { text } = await mock(
      '```json\n[{"id": 7, "category": "AI", "relevance": 0.9, "oneLineSummary": "GPT-6 launched."}]\n```',
    ).complete({ prompt: "" });
    expect(parseEnrichment(text)).toEqual([
      { id: 7, category: "AI", relevance: 0.9, oneLineSummary: "GPT-6 launched." },
    ]);
  });

  it("rejects malformed output with a bad_output error", () => {
    expect(() => parseEnrichment("Sorry, I can't help")).toThrow(LLMError);
    expect(() => parseEnrichment('[{"id": 1, "relevance": 5}]')).toThrow(/validation/);
  });
});
