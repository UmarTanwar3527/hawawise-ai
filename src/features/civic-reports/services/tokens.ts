import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { getServerEnv } from "@/config/env";

import { REPORT_LIMITS } from "../constants";
import { photoAnalysisSchema, type PhotoAnalysis } from "../schemas";

/**
 * The analysis is returned to the browser and sent back with the final
 * submission. A token binds it to the exact photo bytes and an expiry, so the
 * stored AI label cannot be forged or moved to another photo, and the photo is
 * analysed (and billed) only once.
 */

function key(purpose: string, secret = getServerEnv().SUPABASE_SERVICE_ROLE_KEY ?? ""): Buffer {
  if (!secret) throw new Error("Report signing is not configured.");
  // Domain-separated keys derived from a server-only secret.
  return createHash("sha256").update(`hawa-ai/${purpose}/v1|${secret}`).digest();
}

/** Canonical form: parsed through the schema so key order is stable. */
export function canonicalAnalysis(analysis: PhotoAnalysis): string {
  return JSON.stringify(photoAnalysisSchema.parse(analysis));
}

function mac(imageSha256: string, analysis: PhotoAnalysis, expiresAt: number, secret?: string): string {
  return createHmac("sha256", key("report-analysis", secret))
    .update(`${imageSha256}|${expiresAt}|${canonicalAnalysis(analysis)}`)
    .digest("base64url");
}

export function signAnalysis(imageSha256: string, analysis: PhotoAnalysis, now = Date.now(), secret?: string): string {
  const expiresAt = now + REPORT_LIMITS.tokenTtlMinutes * 60_000;
  return `${expiresAt}.${mac(imageSha256, analysis, expiresAt, secret)}`;
}

export function verifyAnalysis(
  token: string,
  imageSha256: string,
  analysis: PhotoAnalysis,
  now = Date.now(),
  secret?: string,
): boolean {
  const [expiresRaw, signature] = token.split(".");
  const expiresAt = Number(expiresRaw);
  if (!signature || !Number.isFinite(expiresAt) || expiresAt < now) return false;
  const expected = Buffer.from(mac(imageSha256, analysis, expiresAt, secret));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Pseudonymous submitter id for abuse limits: an HMAC of the client address.
 * Not reversible without the server secret; cleared from reports after 48 h.
 */
export function submitterHash(clientAddress: string, secret?: string): string {
  return createHmac("sha256", key("report-submitter", secret)).update(clientAddress).digest("hex").slice(0, 40);
}
