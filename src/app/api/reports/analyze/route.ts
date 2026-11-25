import { analysePhoto, PhotoAnalysisError } from "@/features/civic-reports/services/analyse-photo";
import { bodyTooLarge, readPhoto } from "@/features/civic-reports/services/photo-input";
import { signAnalysis } from "@/features/civic-reports/services/tokens";
import { getServerEnv } from "@/config/env";
import { generateWithGemini, isGeminiConfigured } from "@/lib/gemini/client";
import { GeminiError } from "@/lib/gemini/types";
import { jsonError } from "@/lib/http/api-response";
import { clientAddress, RateLimiter } from "@/lib/security/rate-limit";

export const maxDuration = 60;

/** Per visitor: 6 photos per 10 minutes, 20 a day. Per instance: 400 a day. */
const perClient = new RateLimiter([
  { limit: 6, windowMs: 600_000 },
  { limit: 20, windowMs: 86_400_000 },
]);
const perInstance = new RateLimiter([{ limit: 400, windowMs: 86_400_000 }]);

/**
 * Step 1 of a civic report: AI analysis of the photo. Nothing is stored. The
 * analysis comes back with a token that binds it to these exact photo bytes.
 */
export async function POST(request: Request) {
  if (bodyTooLarge(request)) return jsonError("payload_too_large", "The photo is too large (3 MB maximum).", 413);
  if (!isGeminiConfigured() || !getServerEnv().SUPABASE_SERVICE_ROLE_KEY) {
    return jsonError("not_configured", "Photo analysis is not configured.", 503);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("invalid_request", "Send the photo as multipart form data.", 400);
  }
  const photo = await readPhoto(form);
  if (!photo.ok) return jsonError("invalid_photo", photo.message, 400);

  for (const [limiter, key] of [
    [perClient, clientAddress(request.headers)],
    [perInstance, "global"],
  ] as const) {
    const result = limiter.check(key);
    if (!result.allowed) {
      const response = jsonError("rate_limited", "Too many photos. Please wait a few minutes and try again.", 429);
      response.headers.set("Retry-After", String(result.retryAfterSeconds));
      return response;
    }
  }

  try {
    const analysis = await analysePhoto({ jpeg: photo.jpeg, generate: generateWithGemini });
    return Response.json(
      { analysis, token: signAnalysis(photo.sha256, analysis) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof GeminiError) {
      console.error("photo analysis model error", error.kind, error.status ?? "");
      const busy = error.kind === "rate_limited" || error.kind === "unavailable";
      return jsonError(
        "ai_unavailable",
        error.kind === "blocked"
          ? "This photo could not be analysed. Try a different photo."
          : busy
            ? "The AI is busy right now. Please try again in a minute."
            : "The photo could not be analysed right now. Please try again.",
        503,
      );
    }
    if (error instanceof PhotoAnalysisError) {
      return jsonError("analysis_failed", "The AI could not produce a reliable analysis of this photo. Try another photo.", 502);
    }
    console.error("photo analysis failed", error instanceof Error ? error.name : "unknown");
    return jsonError("unavailable", "Photo analysis is temporarily unavailable.", 503);
  }
}
