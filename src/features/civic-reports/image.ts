/**
 * Server-side photo checks. The browser re-encodes photos to JPEG (which drops
 * EXIF, including GPS), but the server never trusts that: it accepts JPEG only,
 * detected from the bytes, and removes metadata segments again.
 */

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/**
 * Removes metadata segments from a baseline/progressive JPEG:
 * APP1 (EXIF/XMP, including GPS), APP3–APP13 (IPTC and vendor data),
 * APP15 and COM. Keeps APP0 (JFIF), APP2 (ICC colour profile) and APP14
 * (Adobe colour transform), which are needed to render colours correctly.
 * Returns null if the structure is not a well-formed JPEG.
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array | null {
  if (!isJpeg(bytes)) return null;
  const out: number[] = [0xff, 0xd8];
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    // Skip fill bytes.
    while (bytes[offset] === 0xff && offset < bytes.length) offset += 1;
    const marker = bytes[offset];
    if (marker === undefined) return null;
    offset += 1;

    // Start of scan: the rest is entropy-coded image data; copy it verbatim.
    if (marker === 0xda) {
      const rest = bytes.subarray(offset - 2);
      const result = new Uint8Array(out.length + rest.length);
      result.set(out);
      result.set(rest, out.length);
      return result;
    }
    // Markers without a length field.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(0xff, marker);
      continue;
    }
    if (marker === 0xd9) return null; // End of image before any scan.

    const high = bytes[offset];
    const low = bytes[offset + 1];
    if (high === undefined || low === undefined) return null;
    const length = (high << 8) | low;
    if (length < 2 || offset + length > bytes.length) return null;

    const isApp = marker >= 0xe0 && marker <= 0xef;
    const keep = !isApp ? marker !== 0xfe : marker === 0xe0 || marker === 0xe2 || marker === 0xee;
    if (keep) {
      out.push(0xff, marker);
      for (let i = offset; i < offset + length; i += 1) out.push(bytes[i] as number);
    }
    offset += length;
  }
  return null;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
