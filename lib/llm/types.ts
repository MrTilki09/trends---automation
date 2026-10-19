export interface LLMCompleteInput {
  system?: string;
  prompt: string;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface LLMProvider {
  name: string;
  complete(input: LLMCompleteInput): Promise<{ text: string; raw?: unknown }>;
}

export type LLMErrorKind = "auth" | "usage_limit" | "timeout" | "not_installed" | "bad_output" | "other";

/** Error with a category, so the dashboard can say *why* enrichment failed. */
export class LLMError extends Error {
  constructor(
    public kind: LLMErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "LLMError";
  }
}
