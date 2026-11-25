import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";

import type { Database } from "@/lib/supabase/database.types";
import { createSupabasePublicClient } from "@/lib/supabase/public";

import { roundCoordinate, type ReportCategory } from "../constants";
import type { PhotoAnalysis, PublicReport } from "../schemas";

type Db = SupabaseClient<Database>;

export const CIVIC_REPORTS_CACHE_TAG = "civic-reports";
const BUCKET = "report-media";

export class ReportError extends Error {
  constructor(readonly kind: "duplicate" | "quota" | "storage" | "database") {
    super(`Report failed: ${kind}`);
    this.name = "ReportError";
  }
}

/**
 * Stores an anonymous report: the row first (so the database quota check runs
 * before any upload), then the private photo, then its media record. Any later
 * failure removes what was written.
 */
export async function createAnonymousReport({
  db,
  jpeg,
  imageSha256,
  analysis,
  category,
  description,
  latitude,
  longitude,
  submitter,
}: {
  db: Db;
  jpeg: Uint8Array;
  imageSha256: string;
  analysis: PhotoAnalysis;
  category: ReportCategory;
  description: string;
  latitude: number;
  longitude: number;
  submitter: string;
}): Promise<{ id: string }> {
  const { data: duplicate, error: duplicateError } = await db
    .from("report_media")
    .select("id")
    .eq("sha256", imageSha256)
    .limit(1)
    .maybeSingle();
  if (duplicateError) throw new ReportError("database");
  if (duplicate) throw new ReportError("duplicate");

  const id = randomUUID();
  const path = `anonymous/${id}/photo.jpg`;

  const { error: insertError } = await db.from("civic_reports").insert({
    id,
    user_id: null,
    submission_channel: "anonymous",
    category,
    description: description || null,
    latitude: roundCoordinate(latitude),
    longitude: roundCoordinate(longitude),
    ai_category: analysis.category,
    ai_confidence: analysis.confidence,
    ai_visible_severity: analysis.visibleSeverity,
    ai_model: analysis.model,
    ai_prompt_version: analysis.promptVersion,
    ai_classification: {
      observations: analysis.observations,
      recommendations: analysis.recommendations,
      limitations: analysis.limitations,
      peopleVisible: analysis.peopleVisible,
      licencePlatesReadable: analysis.licencePlatesReadable,
      analysedAt: analysis.analysedAt,
    },
    submitter_hash: submitter,
  });
  if (insertError) {
    if (insertError.code === "P0429") throw new ReportError("quota");
    console.error("report insert failed", insertError.code);
    throw new ReportError("database");
  }

  const removeReport = async () => {
    const { error } = await db.from("civic_reports").delete().eq("id", id);
    if (error) console.error("report cleanup failed", error.code);
  };

  const { error: uploadError } = await db.storage
    .from(BUCKET)
    .upload(path, jpeg, { contentType: "image/jpeg", upsert: false });
  if (uploadError) {
    console.error("report upload failed", uploadError.name);
    await removeReport();
    throw new ReportError("storage");
  }

  const { error: mediaError } = await db.from("report_media").insert({
    report_id: id,
    user_id: null,
    storage_path: path,
    mime_type: "image/jpeg",
    size_bytes: jpeg.byteLength,
    sha256: imageSha256,
  });
  if (mediaError) {
    console.error("report media insert failed", mediaError.code);
    await db.storage.from(BUCKET).remove([path]);
    await removeReport();
    throw new ReportError("database");
  }

  return { id };
}

/** Published reports for the map and list, read as the public (anon) role. */
export async function getPublicReports(limit = 200): Promise<PublicReport[]> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  cacheTag(CIVIC_REPORTS_CACHE_TAG);
  const { data, error } = await createSupabasePublicClient()
    .from("civic_reports")
    .select("id, category, ai_category, ai_confidence, ai_visible_severity, latitude, longitude, status, verification_status, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data
    .filter((row) => row.latitude !== null && row.longitude !== null)
    .map((row) => ({
      id: row.id,
      category: row.category,
      aiCategory: row.ai_category,
      aiConfidence: row.ai_confidence,
      visibleSeverity: row.ai_visible_severity,
      latitude: row.latitude as number,
      longitude: row.longitude as number,
      status: row.status,
      verificationStatus: row.verification_status,
      createdAt: row.created_at,
    }));
}
