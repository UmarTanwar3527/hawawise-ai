import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time check of an `Authorization: Bearer <token>` header.
 * Both sides are hashed first so the comparison length never depends on input.
 */
export function isValidBearer(header: string | null, expectedToken: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const provided = createHash("sha256").update(header.slice("Bearer ".length)).digest();
  const expected = createHash("sha256").update(expectedToken).digest();
  return timingSafeEqual(provided, expected);
}
