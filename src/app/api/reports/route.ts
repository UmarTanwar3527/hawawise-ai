import { revalidateTag } from "next/cache";
import { connection } from "next/server";

import { photoAnalysisSchema, reportSubmissionSchema } from "@/features/civic-reports/schemas";
import { bodyTooLarge, readPhoto } from "@/features/civic-reports/services/photo-input";
import {
  CIVIC_REPORTS_CACHE_TAG,
  createAnonymousReport,
  getPublicReports,
  ReportError,
} from "@/features/civic-reports/services/reports";
import { submitterHash, verifyAnalysis } from "@/features/civic-reports/services/tokens";
import { getServerEnv } from "@/config/env";
import { jsonError } from "@/lib/http/api-response";
import { clientAddress, RateLimiter } from "@/lib/security/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** First line of defence; the database enforces 3/hour, 10/day per submitter and 300/day overall. */
const perClient = new RateLimiter([
  { limit: 3, windowMs: 3_600_000 },
  { limit: 10, windowMs: 86_400_000 },
]);

/** Published community reports (public columns only). */
export async function GET() {
  await connection();
  if (!isSupabaseConfigured()) return jsonError("not_configured", "Storage is not configured.", 503);
  try {
    const reports = await getPublicReports();
    return Response.json(
      { reports, note: "Community submissions, not official complaints. Locations are rounded to about 110 m." },
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  } catch (error) {
    console.error("public reports failed", error instanceof Error ? error.name : "unknown");
    return jsonError("unavailable", "Reports are temporarily unavailable.", 503);
  }
}

/** Step 2: store an anonymous report whose photo was analysed in step 1. */
export async function POST(request: Request) {
  if (bodyTooLarge(request)) return jsonError("payload_too_large", "The photo is too large (3 MB maximum).", 413);
  if (!isSupabaseConfigured() || !getServerEnv().SUPABASE_SERVICE_ROLE_KEY) {
    return jsonError("not_configured", "Reports are not configured.", 503);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("invalid_request", "Send the report as multipart form data.", 400);
  }

  const fields = reportSubmissionSchema.safeParse({
    category: form.get("category"),
    latitude: form.get("latitude"),
    longitude: form.get("longitude"),
    description: form.get("description") ?? "",
    consent: form.get("consent"),
    analysis: form.get("analysis"),
    token: form.get("token"),
  });
  if (!fields.success) {
    return jsonError("invalid_request", fields.error.issues[0]?.message ?? "Check the report details.", 400);
  }

  let analysisJson: unknown;
  try {
    analysisJson = JSON.parse(fields.data.analysis);
  } catch {
    return jsonError("invalid_request", "The photo analysis is missing. Analyse the photo again.", 400);
  }
  const analysis = photoAnalysisSchema.safeParse(analysisJson);
  if (!analysis.success) return jsonError("invalid_request", "The photo analysis is invalid. Analyse the photo again.", 400);

  const photo = await readPhoto(form);
  if (!photo.ok) return jsonError("invalid_photo", photo.message, 400);

  if (!verifyAnalysis(fields.data.token, photo.sha256, analysis.data)) {
    return jsonError("analysis_mismatch", "The analysis has expired or does not match this photo. Analyse the photo again.", 400);
  }
  if (!analysis.data.canSubmit) {
    return jsonError("photo_not_accepted", "This photo cannot be used for a report. Try a clear outdoor photo.", 422);
  }

  const address = clientAddress(request.headers);
  const limit = perClient.check(address);
  if (!limit.allowed) {
    const response = jsonError("rate_limited", "You have sent several reports recently. Please try again later.", 429);
    response.headers.set("Retry-After", String(limit.retryAfterSeconds));
    return response;
  }

  try {
    const { id } = await createAnonymousReport({
      db: createSupabaseAdminClient(),
      jpeg: photo.jpeg,
      imageSha256: photo.sha256,
      analysis: analysis.data,
      category: fields.data.category,
      description: fields.data.description,
      latitude: fields.data.latitude,
      longitude: fields.data.longitude,
      submitter: submitterHash(address),
    });
    revalidateTag(CIVIC_REPORTS_CACHE_TAG, { expire: 0 });
    return Response.json({ id }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ReportError) {
      if (error.kind === "duplicate") return jsonError("duplicate", "This photo has already been reported.", 409);
      if (error.kind === "quota") return jsonError("rate_limited", "You have sent several reports recently. Please try again later.", 429);
    }
    console.error("report submission failed", error instanceof Error ? error.message : "unknown");
    return jsonError("unavailable", "The report could not be saved. Please try again.", 503);
  }
}
