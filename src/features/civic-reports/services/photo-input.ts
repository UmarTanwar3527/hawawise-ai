import "server-only";

import { REPORT_LIMITS } from "../constants";
import { isJpeg, sha256Hex, stripJpegMetadata } from "../image";

export type PhotoInput = { ok: true; jpeg: Uint8Array; sha256: string } | { ok: false; message: string };

/**
 * Reads the "photo" field: JPEG only (checked from the bytes), size-limited,
 * metadata stripped. The hash is of the stripped bytes, so the same photo
 * hashes the same in both steps.
 */
export async function readPhoto(form: FormData): Promise<PhotoInput> {
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Add a photo." };
  if (file.size > REPORT_LIMITS.maxImageBytes) return { ok: false, message: "The photo is too large (3 MB maximum)." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isJpeg(bytes)) return { ok: false, message: "The photo must be a JPEG image." };
  const jpeg = stripJpegMetadata(bytes);
  if (!jpeg) return { ok: false, message: "The photo could not be read. Try another photo." };
  return { ok: true, jpeg, sha256: await sha256Hex(jpeg) };
}

/** Rejects bodies over the limit before reading them. */
export function bodyTooLarge(request: Request): boolean {
  return Number(request.headers.get("content-length") ?? 0) > REPORT_LIMITS.maxImageBytes + 64_000;
}
