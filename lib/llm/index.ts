import { getConfig } from "../config";
import { createClaudeCliProvider } from "./claude-cli";
import { LLMError, type LLMProvider } from "./types";

export * from "./types";

/**
 * Picks the LLM implementation from LLM_PROVIDER. The rest of the code only ever talks to
 * the LLMProvider interface, never to the CLI directly.
 */
export function getLLMProvider(): LLMProvider {
  const cfg = getConfig();
  switch (cfg.LLM_PROVIDER) {
    case "claude-cli":
      return createClaudeCliProvider({ model: cfg.LLM_MODEL });
    case "anthropic-api":
      // TODO(phase 6 / SaaS): implement with @anthropic-ai/sdk and ANTHROPIC_API_KEY.
      // Required as soon as anyone other than the owner uses this.
      throw new LLMError("other", "LLM_PROVIDER=anthropic-api is not implemented yet");
    case "openai-compatible":
      // TODO(cost scaling): OpenAI-compatible chat endpoint (DeepSeek etc.) for cheap bulk steps.
      // Mind data jurisdiction: never send sensitive data to such providers.
      throw new LLMError("other", "LLM_PROVIDER=openai-compatible is not implemented yet");
  }
}
