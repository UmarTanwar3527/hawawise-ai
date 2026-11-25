import "server-only";

import { extractClaimedFigures } from "@/features/ai-guardian/agents/grounding";
import type { GenerateFn, ModelContent, ToolDeclaration } from "@/lib/gemini/types";

import { AI_CATEGORY_IDS, VISIBLE_SEVERITY } from "../constants";
import { PHOTO_ANALYSIS_PROMPT_VERSION, PHOTO_ANALYSIS_SYSTEM_PROMPT } from "../prompts/photo-analysis.v1";
import { modelAnalysisSchema, type ModelAnalysis, type PhotoAnalysis } from "../schemas";

const SUBMIT: ToolDeclaration = {
  name: "submit_photo_analysis",
  description: "Submit the structured analysis of the photo.",
  parameters: {
    type: "object",
    properties: {
      imageUsable: { type: "boolean" },
      imageIssue: {
        type: "string",
        enum: ["none", "not_outdoor_scene", "too_dark_or_blurry", "screenshot_or_artwork", "inappropriate"],
      },
      pollutionVisible: { type: "boolean" },
      category: { type: "string", enum: [...AI_CATEGORY_IDS] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      visibleSeverity: { type: "string", enum: Object.keys(VISIBLE_SEVERITY) },
      observations: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
      recommendations: { type: "array", items: { type: "string" }, maxItems: 3 },
      limitations: { type: "array", items: { type: "string" }, maxItems: 3 },
      peopleVisible: { type: "boolean" },
      licencePlatesReadable: { type: "boolean" },
    },
    required: ["imageUsable", "imageIssue", "pollutionVisible", "category", "confidence", "visibleSeverity", "observations"],
  },
};

/** Always shown, whatever the model says. */
export const FIXED_LIMITATIONS = [
  "A photo cannot measure air quality: no AQI or pollutant concentration is inferred from it.",
  "The location and the source have not been verified.",
] as const;

export class PhotoAnalysisError extends Error {
  constructor(readonly reason: "invalid_output") {
    super(`Photo analysis failed: ${reason}`);
    this.name = "PhotoAnalysisError";
  }
}

/** Problems that make the model's output unacceptable, or null. */
export function findAnalysisProblem(analysis: ModelAnalysis): string | null {
  const texts = [...analysis.observations, ...analysis.recommendations, ...analysis.limitations];
  const figures = texts.flatMap((text) => extractClaimedFigures(text));
  if (figures.length || texts.some((text) => /\b(AQI|PM\s?2\.5|PM\s?10)\b[^.]{0,20}\d/i.test(text))) {
    return "Rejected: do not state AQI values, concentrations or numeric pollution levels. Describe only what is visible.";
  }
  return null;
}

/** Makes the fields consistent and adds the fixed limitations. */
export function normaliseAnalysis(analysis: ModelAnalysis, meta: { model: string; analysedAt: Date }): PhotoAnalysis {
  const usable = analysis.imageUsable && analysis.imageIssue === "none";
  const pollutionVisible = usable && analysis.pollutionVisible && analysis.category !== "none_visible";
  const limitations = [...new Set([...FIXED_LIMITATIONS, ...analysis.limitations])].slice(0, 5);
  return {
    ...analysis,
    imageUsable: usable,
    imageIssue: usable ? "none" : analysis.imageIssue === "none" ? "not_outdoor_scene" : analysis.imageIssue,
    pollutionVisible,
    category: pollutionVisible ? analysis.category : "none_visible",
    visibleSeverity: pollutionVisible ? analysis.visibleSeverity : "unclear",
    confidence: Math.round(analysis.confidence * 100) / 100,
    recommendations: usable ? analysis.recommendations : [],
    limitations,
    canSubmit: usable,
    model: meta.model.slice(0, 100),
    promptVersion: PHOTO_ANALYSIS_PROMPT_VERSION,
    analysedAt: meta.analysedAt.toISOString(),
  };
}

/**
 * One Gemini vision call (plus at most one correction). The photo is passed
 * as inline data; the model must answer through submit_photo_analysis.
 */
export async function analysePhoto({
  jpeg,
  generate,
  now = new Date(),
}: {
  jpeg: Uint8Array;
  generate: GenerateFn;
  now?: Date;
}): Promise<PhotoAnalysis> {
  const contents: ModelContent[] = [
    {
      role: "user",
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: Buffer.from(jpeg).toString("base64") } },
        { text: "Analyse this photo submitted as a possible air-pollution report in Jaipur." },
      ],
    },
  ];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await generate({
      systemInstruction: PHOTO_ANALYSIS_SYSTEM_PROMPT,
      contents,
      tools: [SUBMIT],
      allowedTools: [SUBMIT.name],
      maxOutputTokens: 900,
    });
    const call = result.functionCalls.find((c) => c.name === SUBMIT.name);
    const parsed = modelAnalysisSchema.safeParse(call?.args);
    const problem = parsed.success
      ? findAnalysisProblem(parsed.data)
      : `Rejected: the analysis did not match the schema (${parsed.error.issues[0]?.path.join(".") ?? "unknown"}). Call submit_photo_analysis again.`;
    if (parsed.success && !problem) {
      return normaliseAnalysis(parsed.data, { model: result.model ?? "gemini", analysedAt: now });
    }
    console.warn("photo analysis rejected", parsed.success ? "figures" : "schema");
    contents.push(
      result.content,
      call
        ? { role: "user", parts: [{ functionResponse: { name: SUBMIT.name, id: call.id, response: { error: problem } } }] }
        : { role: "user", parts: [{ text: problem ?? "Call submit_photo_analysis." }] },
    );
  }
  throw new PhotoAnalysisError("invalid_output");
}
