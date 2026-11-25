import "server-only";

import type { GenerateFn, ModelContent, ModelPart } from "@/lib/gemini/types";
import { formatDateTimeIst } from "@/lib/utils/format";

import { airGuardianSystemPrompt, AIR_GUARDIAN_PROMPT_VERSION } from "../prompts/air-guardian.v1";
import { KNOWLEDGE_BASE } from "../rag/knowledge-base";
import { submitAnswerSchema, type Evidence, type GuardianResponse, type SubmitAnswer } from "../schemas/response";
import type { GuardianDataSource } from "../tools/data-source";
import { executeTool, TOOL_DECLARATIONS, type ToolExecution } from "../tools/tools";

import { collectDataNumbers, collectNumbers, findUnsupportedFigures } from "./grounding";

export const GUARDIAN_LIMITS = { maxTurns: 5, maxToolCalls: 8 } as const;

const ALL_TOOLS = TOOL_DECLARATIONS.map((tool) => tool.name);
/** Static reference numbers (WHO, NAAQS, CPCB bands) are always allowed in answers. */
const KNOWLEDGE_NUMBERS = collectNumbers(KNOWLEDGE_BASE.map((item) => item.content));

function dedupeEvidence(items: Evidence[]): Evidence[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = [item.source, item.station, item.observedAt, item.dataKind, item.url].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fallbackAnswer(language: "en" | "hi", reason: "ungrounded" | "incomplete"): SubmitAnswer {
  const en =
    reason === "ungrounded"
      ? "I couldn't produce an answer whose figures match the verified data, so I won't give numbers. Please check the dashboard for the latest measured values, or ask again."
      : "I couldn't complete a verified answer this time. Please try asking again, or check the dashboard for the latest measured values.";
  const hi =
    reason === "ungrounded"
      ? "मैं ऐसा उत्तर नहीं बना सका जिसके आँकड़े सत्यापित डेटा से मेल खाते हों, इसलिए मैं कोई संख्या नहीं दूँगा। नवीनतम मापे गए मान डैशबोर्ड पर देखें, या फिर से पूछें।"
      : "इस बार मैं सत्यापित उत्तर पूरा नहीं कर सका। कृपया फिर से पूछें, या नवीनतम मापे गए मान डैशबोर्ड पर देखें।";
  return { answer: language === "hi" ? hi : en, summary: "", language, recommendations: [], warnings: [] };
}

const HINGLISH =
  /\b(hindi|kya|kyu|kyon|hai|hain|mein|samjhao|samjhaiye|aaj|kal|abhi|kaisi|kaisa|kaise|batao|bataiye|kitna|kitni|hawa|nahi|kripya|chahiye)\b/i;

/** Reply language: Hindi for Devanagari, Hinglish or an explicit request; otherwise English. */
export function detectLanguage(text: string): "en" | "hi" {
  return /[ऀ-ॿ]/.test(text) || HINGLISH.test(text) ? "hi" : "en";
}

export type RunGuardianInput = {
  message: string;
  history: ModelContent[];
  generate: GenerateFn;
  data: GuardianDataSource;
};

/**
 * Controlled tool-calling loop:
 *   question → model picks allowlisted tools → server validates and runs them
 *   → results go back as data → model calls submit_answer → server validates
 *   the shape and checks every figure against the retrieved data.
 */
export async function runGuardian({ message, history, generate, data }: RunGuardianInput): Promise<GuardianResponse> {
  // The server decides the reply language; the model is told explicitly and checked.
  const language = detectLanguage(message);
  const systemInstruction = `${airGuardianSystemPrompt(formatDateTimeIst(data.now().toISOString()))}

REPLY LANGUAGE FOR THIS QUESTION: ${language === "hi" ? 'Hindi (Devanagari script); set language to "hi"' : 'English; set language to "en"'}.`;
  const contents: ModelContent[] = [...history, { role: "user", parts: [{ text: message }] }];
  const executions: ToolExecution[] = [];
  let toolCalls = 0;
  let groundingRetryUsed = false;
  let languageRetryUsed = false;
  let final: { answer: SubmitAnswer; grounded: boolean } | null = null;

  for (let turn = 0; turn < GUARDIAN_LIMITS.maxTurns && !final; turn += 1) {
    const lastTurn = turn === GUARDIAN_LIMITS.maxTurns - 1 || toolCalls >= GUARDIAN_LIMITS.maxToolCalls;
    const result = await generate({
      systemInstruction,
      contents,
      tools: TOOL_DECLARATIONS,
      allowedTools: lastTurn ? ["submit_answer"] : ALL_TOOLS,
    });
    contents.push(result.content);

    if (result.functionCalls.length === 0) {
      contents.push({ role: "user", parts: [{ text: "Respond by calling submit_answer with your final answer." }] });
      continue;
    }

    const responses: ModelPart[] = [];
    for (const call of result.functionCalls) {
      if (call.name === "submit_answer") {
        const parsed = submitAnswerSchema.safeParse(call.args);
        if (!parsed.success) {
          responses.push({ functionResponse: { name: call.name, id: call.id, response: { error: "Invalid answer format. Provide answer and language ('en' or 'hi')." } } });
          continue;
        }
        if (parsed.data.language !== language && !languageRetryUsed) {
          languageRetryUsed = true;
          responses.push({
            functionResponse: {
              name: call.name,
              id: call.id,
              response: {
                error: `Rejected: reply in ${language === "hi" ? "Hindi (Devanagari script)" : "English"} with language "${language}", then call submit_answer again.`,
              },
            },
          });
          continue;
        }
        const allowed = collectDataNumbers(executions.map((e) => e.result), new Set(KNOWLEDGE_NUMBERS));
        const text = [parsed.data.answer, parsed.data.summary, ...parsed.data.recommendations, ...parsed.data.warnings].join("\n");
        const unsupported = findUnsupportedFigures(text, allowed);
        if (unsupported.length === 0) {
          final = { answer: parsed.data, grounded: true };
        } else if (!groundingRetryUsed) {
          groundingRetryUsed = true;
          console.warn("guardian grounding rejected figures", unsupported.join(","));
          responses.push({
            functionResponse: {
              name: call.name,
              id: call.id,
              response: {
                error: `Rejected: these figures do not appear in the retrieved data: ${unsupported.join(", ")}. Retrieve the data with a tool, or remove the figures, then call submit_answer again.`,
              },
            },
          });
        } else {
          final = { answer: fallbackAnswer(parsed.data.language, "ungrounded"), grounded: false };
        }
        continue;
      }

      if (toolCalls >= GUARDIAN_LIMITS.maxToolCalls) {
        responses.push({ functionResponse: { name: call.name, id: call.id, response: { error: "Tool limit reached. Call submit_answer now." } } });
        continue;
      }
      toolCalls += 1;
      const execution = await executeTool(call.name, call.args, data);
      executions.push(execution);
      responses.push({ functionResponse: { name: call.name, id: call.id, response: execution.result } });
    }

    if (!final && responses.length) contents.push({ role: "user", parts: responses });
  }

  const outcome = final ?? { answer: fallbackAnswer(language, "incomplete"), grounded: false };
  const serverWarnings = executions.flatMap((e) => e.warnings);

  return {
    answer: outcome.answer.answer,
    language: outcome.answer.language,
    summary: outcome.answer.summary,
    recommendations: outcome.answer.recommendations,
    warnings: [...new Set([...serverWarnings, ...outcome.answer.warnings])],
    evidence: outcome.grounded ? dedupeEvidence(executions.flatMap((e) => e.evidence)) : [],
    toolCalls: executions.map(({ name, label, ok }) => ({ name, label, ok })),
    grounded: outcome.grounded,
    promptVersion: AIR_GUARDIAN_PROMPT_VERSION,
  };
}
