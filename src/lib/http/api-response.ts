/**
 * Consistent JSON error envelope for API routes:
 *   { "error": { "code": string, "message": string } }
 * Messages must be safe to show to users and never include secrets,
 * stack traces or upstream provider payloads.
 */
export function jsonError(code: string, message: string, status: number): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/** Explicit response for endpoints that are planned but not yet built. */
export function notImplemented(feature: string): Response {
  return jsonError(
    "not_implemented",
    `${feature} is not available yet. This endpoint is reserved for an upcoming integration.`,
    501,
  );
}
