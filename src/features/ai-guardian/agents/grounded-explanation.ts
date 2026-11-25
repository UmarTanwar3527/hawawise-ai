import "server-only";

import { z } from "zod";

import type { GenerateFn, ModelContent, ToolDeclaration } from "@/lib/gemini/types";

import { collectDataNumbers, findUnsupportedFigures } from "./grounding";

const SUBMIT: ToolDeclaration = {
  name: "submit_explanation",
  description: "Submit the explanation.",
  parameters: {
    type: "object",
    properties: {
      explanation: { type: "string" },
      language: { type: "string", enum: ["en", "hi"] },
    },
    required: ["explanation", "language"],
  },
};

const submitSchema = z.object({
  explanation: z.string().trim().min(1).max(2_500),
  language: z.enum(["en", "hi"]),
});

const DEVANAGARI = /[ऀ-ॿ]/;

export type GroundedExplanation =
  | { status: "ok"; explanation: string; language: "en" | "hi"; promptVersion: string }
  | { status: "ungrounded"; promptVersion: string };

/**
 * Explains already-calculated facts in one model turn (plus at most one
 * correction). Every AQI or concentration figure must match a numeric field
 * of `facts` (or `extraAllowed`), and the reply must be in the requested
 * language. Used by the exposure planner and City insights.
 */
export async function generateGroundedExplanation({
  facts,
  task,
  systemInstruction,
  promptVersion,
  language,
  generate,
  extraAllowed = [],
  maxOutputTokens = 700,
  logLabel,
}: {
  facts: unknown;
  /** First line of the user turn, e.g. "Explain this exposure plan." */
  task: string;
  systemInstruction: string;
  promptVersion: string;
  language: "en" | "hi";
  generate: GenerateFn;
  extraAllowed?: number[];
  maxOutputTokens?: number;
  logLabel: string;
}): Promise<GroundedExplanation> {
  const allowed = collectDataNumbers(facts, new Set(extraAllowed));
  const contents: ModelContent[] = [{ role: "user", parts: [{ text: `${task}\n\nDATA (JSON):\n${JSON.stringify(facts)}` }] }];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await generate({ systemInstruction, contents, tools: [SUBMIT], allowedTools: [SUBMIT.name], maxOutputTokens });
    const call = result.functionCalls.find((c) => c.name === SUBMIT.name);
    const parsed = submitSchema.safeParse(call?.args);

    let problem: string;
    if (!parsed.success) problem = "Call submit_explanation with explanation and language.";
    else {
      const unsupported = findUnsupportedFigures(parsed.data.explanation, allowed);
      const wrongLanguage = DEVANAGARI.test(parsed.data.explanation) !== (language === "hi");
      if (unsupported.length) {
        console.warn(`${logLabel} explanation rejected figures`, unsupported.join(","));
        problem = `Rejected: these figures are not in the data: ${unsupported.join(", ")}. Use only figures from the data.`;
      } else if (wrongLanguage) {
        problem = language === "hi" ? "Rewrite the explanation in Hindi (Devanagari script)." : "Rewrite the explanation in English.";
      } else {
        return { status: "ok", explanation: parsed.data.explanation, language, promptVersion };
      }
    }

    contents.push(
      result.content,
      call
        ? { role: "user", parts: [{ functionResponse: { name: SUBMIT.name, id: call.id, response: { error: problem } } }] }
        : { role: "user", parts: [{ text: problem }] },
    );
  }
  return { status: "ungrounded", promptVersion };
}
