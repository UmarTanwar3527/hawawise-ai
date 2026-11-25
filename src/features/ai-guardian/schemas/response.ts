import { z } from "zod";

/** Arguments the model must supply to submit_answer. */
export const submitAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(4000),
  summary: z.string().trim().max(300).default(""),
  language: z.enum(["en", "hi"]),
  recommendations: z.array(z.string().trim().min(1).max(300)).max(6).default([]),
  warnings: z.array(z.string().trim().min(1).max(300)).max(6).default([]),
});
export type SubmitAnswer = z.infer<typeof submitAnswerSchema>;

/** One piece of evidence, always built server-side from actual tool results. */
export const evidenceSchema = z.object({
  source: z.string(),
  station: z.string().nullable(),
  observedAt: z.string().nullable(),
  fetchedAt: z.string().nullable(),
  dataKind: z.enum(["measured", "modelled", "forecast", "reference"]),
  aqiStandard: z.string().nullable(),
  url: z.string().nullable(),
});
export type Evidence = z.infer<typeof evidenceSchema>;

export const toolActivitySchema = z.object({
  name: z.string(),
  label: z.string(),
  ok: z.boolean(),
});
export type ToolActivity = z.infer<typeof toolActivitySchema>;

/** The response returned to the browser. */
export const guardianResponseSchema = z.object({
  answer: z.string(),
  language: z.enum(["en", "hi"]),
  summary: z.string(),
  recommendations: z.array(z.string()),
  evidence: z.array(evidenceSchema),
  warnings: z.array(z.string()),
  toolCalls: z.array(toolActivitySchema),
  /** False when the answer is a server fallback rather than a grounded model answer. */
  grounded: z.boolean(),
  promptVersion: z.string(),
});
export type GuardianResponse = z.infer<typeof guardianResponseSchema>;

/** Chat history sent back by the browser. Assistant turns must carry a valid server signature. */
export const historyItemSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(4000),
  signature: z.string().max(128).optional(),
});

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1, "Ask a question.").max(1000, "Questions are limited to 1,000 characters."),
  history: z.array(historyItemSchema).max(12).default([]),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;
