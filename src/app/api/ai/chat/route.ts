import { historyToContents, signAssistantText } from "@/features/ai-guardian/agents/history";
import { runGuardian } from "@/features/ai-guardian/agents/orchestrator";
import { chatRequestSchema } from "@/features/ai-guardian/schemas/response";
import { createGuardianDataSource } from "@/features/ai-guardian/tools/data-source";
import { generateWithGemini, isGeminiConfigured } from "@/lib/gemini/client";
import { GeminiError } from "@/lib/gemini/types";
import { jsonError } from "@/lib/http/api-response";
import { clientAddress, RateLimiter } from "@/lib/security/rate-limit";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const maxDuration = 60;

const MAX_BODY_BYTES = 32_000;
/** Per visitor: 8 questions a minute, 60 a day. */
const perClient = new RateLimiter([
  { limit: 8, windowMs: 60_000 },
  { limit: 60, windowMs: 86_400_000 },
]);
/** Per server instance: a daily ceiling to bound model cost. */
const perInstance = new RateLimiter([{ limit: 1_500, windowMs: 86_400_000 }]);

/**
 * Air Guardian. Conversations are not stored (no accounts yet): the browser
 * sends recent history, and assistant turns must carry the server signature
 * returned here.
 */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return jsonError("payload_too_large", "The request is too large.", 413);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_request", "Send a JSON body.", 400);
  }
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("invalid_request", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }
  if (!isGeminiConfigured() || !isSupabaseConfigured()) {
    return jsonError("not_configured", "Air Guardian is not configured.", 503);
  }

  for (const [limiter, key] of [
    [perClient, clientAddress(request.headers)],
    [perInstance, "global"],
  ] as const) {
    const result = limiter.check(key);
    if (!result.allowed) {
      const response = jsonError("rate_limited", "Too many questions. Please wait a moment and try again.", 429);
      response.headers.set("Retry-After", String(result.retryAfterSeconds));
      return response;
    }
  }

  try {
    const answer = await runGuardian({
      message: parsed.data.message,
      history: historyToContents(parsed.data.history),
      generate: generateWithGemini,
      data: createGuardianDataSource(),
    });
    return Response.json(
      { ...answer, signature: signAssistantText(answer.answer) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof GeminiError) {
      console.error("guardian model error", error.kind, error.status ?? "");
      const busy = error.kind === "rate_limited" || error.kind === "unavailable";
      return jsonError(
        "ai_unavailable",
        busy
          ? "Air Guardian is busy right now. Please try again in a minute."
          : "Air Guardian could not answer right now. Please try again.",
        503,
      );
    }
    console.error("guardian failed", error instanceof Error ? error.name : "unknown");
    return jsonError("unavailable", "Air Guardian is temporarily unavailable.", 503);
  }
}
