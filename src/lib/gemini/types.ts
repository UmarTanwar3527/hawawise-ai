/**
 * Provider-neutral shapes for one model turn. The orchestrator depends only on
 * these, so tests can drive it with a scripted model instead of Gemini.
 */

export type ToolDeclaration = {
  name: string;
  description: string;
  /** JSON Schema for the arguments. */
  parameters: Record<string, unknown>;
};

export type ModelPart =
  | { text: string; thoughtSignature?: string }
  /** Image input (base64). Only server code builds these, from validated bytes. */
  | { inlineData: { mimeType: "image/jpeg"; data: string } }
  | { functionCall: { name: string; args: Record<string, unknown>; id?: string }; thoughtSignature?: string }
  | { functionResponse: { name: string; response: Record<string, unknown>; id?: string } };

export type ModelContent = { role: "user" | "model"; parts: ModelPart[] };

export type GenerateRequest = {
  systemInstruction: string;
  contents: ModelContent[];
  tools: ToolDeclaration[];
  /** Restrict this turn to these tools (the model must call one of them). */
  allowedTools: string[];
  maxOutputTokens?: number;
};

export type GenerateResult = {
  /** The model's turn, returned verbatim so it can be appended to the history. */
  content: ModelContent;
  functionCalls: { name: string; args: Record<string, unknown>; id?: string }[];
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  /** The model that produced this turn (after any fallback). */
  model?: string;
};

export type GenerateFn = (request: GenerateRequest) => Promise<GenerateResult>;

export type GeminiErrorKind = "not_configured" | "timeout" | "rate_limited" | "unavailable" | "invalid_request" | "blocked";

/** Safe to log: contains no prompt text, keys or response bodies. */
export class GeminiError extends Error {
  constructor(
    readonly kind: GeminiErrorKind,
    readonly status?: number,
  ) {
    super(`Gemini request failed: ${kind}${status ? ` (HTTP ${status})` : ""}`);
    this.name = "GeminiError";
  }
}
