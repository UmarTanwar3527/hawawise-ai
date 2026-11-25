import { describe, expect, it, vi } from "vitest";

import { isInJaipurArea, roundCoordinate } from "@/features/civic-reports/constants";
import { isJpeg, sha256Hex, stripJpegMetadata } from "@/features/civic-reports/image";
import { reportSubmissionSchema, type ModelAnalysis } from "@/features/civic-reports/schemas";
import { analysePhoto, FIXED_LIMITATIONS, PhotoAnalysisError } from "@/features/civic-reports/services/analyse-photo";
import { readPhoto } from "@/features/civic-reports/services/photo-input";
import { signAnalysis, submitterHash, verifyAnalysis } from "@/features/civic-reports/services/tokens";
import type { GenerateFn } from "@/lib/gemini/types";

/** A structurally valid JPEG: SOI, APP0, APP1 (EXIF with "GPS"), COM, DQT, SOS + data, EOI. */
function syntheticJpeg(): Uint8Array {
  const segment = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];
  const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
  return new Uint8Array([
    0xff, 0xd8,
    ...segment(0xe0, [...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...segment(0xe1, [...ascii("Exif"), 0, 0, ...ascii("GPS 26.9124N 75.7873E")]),
    ...segment(0xfe, ascii("camera owner: someone")),
    ...segment(0xdb, [0, ...Array.from({ length: 64 }, () => 1)]),
    ...segment(0xda, [1, 1, 0, 0, 63, 0]),
    0x12, 0x34, 0xff, 0x00, 0x56,
    0xff, 0xd9,
  ]);
}

const contains = (bytes: Uint8Array, text: string) => Buffer.from(bytes).includes(Buffer.from(text));

describe("photo metadata stripping", () => {
  it("removes EXIF (GPS) and comments but keeps the image structure", () => {
    const original = syntheticJpeg();
    expect(contains(original, "GPS")).toBe(true);
    const stripped = stripJpegMetadata(original);
    expect(stripped).not.toBeNull();
    expect(isJpeg(stripped as Uint8Array)).toBe(true);
    expect(contains(stripped as Uint8Array, "GPS")).toBe(false);
    expect(contains(stripped as Uint8Array, "camera owner")).toBe(false);
    expect(contains(stripped as Uint8Array, "JFIF")).toBe(true);
    // Scan data and end marker copied verbatim.
    expect([...(stripped as Uint8Array).slice(-7)]).toEqual([0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd9]);
  });

  it("is deterministic, so both steps hash the same bytes", async () => {
    const once = stripJpegMetadata(syntheticJpeg()) as Uint8Array;
    const twice = stripJpegMetadata(once) as Uint8Array;
    expect(await sha256Hex(twice)).toBe(await sha256Hex(once));
  });

  it("rejects non-JPEG and malformed input", () => {
    expect(stripJpegMetadata(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBeNull();
    expect(stripJpegMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]))).toBeNull();
    expect(stripJpegMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
  });

  it("accepts only JPEG photos within the size limit", async () => {
    const form = (bytes: Uint8Array) => {
      const data = new FormData();
      data.set("photo", new File([bytes as Uint8Array<ArrayBuffer>], "p.jpg", { type: "image/jpeg" }));
      return data;
    };
    expect(await readPhoto(form(syntheticJpeg()))).toMatchObject({ ok: true });
    expect(await readPhoto(form(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])))).toMatchObject({ ok: false });
    expect(await readPhoto(form(new Uint8Array(3 * 1024 * 1024 + 1)))).toMatchObject({ ok: false, message: expect.stringContaining("too large") });
    expect(await readPhoto(new FormData())).toMatchObject({ ok: false });
  });
});

const goodAnalysis: ModelAnalysis = {
  imageUsable: true,
  imageIssue: "none",
  pollutionVisible: true,
  category: "waste_burning",
  confidence: 0.874,
  visibleSeverity: "moderate",
  observations: ["Grey smoke rising from a pile of burning waste beside a road"],
  recommendations: ["Report open burning to the municipal authority"],
  limitations: ["The fire's source material cannot be confirmed"],
  peopleVisible: false,
  licencePlatesReadable: false,
};

function model(...turns: Partial<ModelAnalysis>[]) {
  const generate = vi.fn<GenerateFn>();
  for (const turn of turns) {
    generate.mockResolvedValueOnce({
      content: { role: "model", parts: [] },
      functionCalls: [{ name: "submit_photo_analysis", args: { ...goodAnalysis, ...turn } }],
      text: "",
      usage: { inputTokens: 0, outputTokens: 0 },
      model: "gemini-test",
    });
  }
  return generate;
}

describe("photo analysis (mocked Gemini)", () => {
  const jpeg = stripJpegMetadata(syntheticJpeg()) as Uint8Array;
  const now = new Date("2026-11-25T10:00:00Z");

  it("sends the photo as inline image data and returns a normalised analysis with fixed limitations", async () => {
    const generate = model({});
    const analysis = await analysePhoto({ jpeg, generate, now });
    const request = generate.mock.calls[0]?.[0];
    expect(request?.allowedTools).toEqual(["submit_photo_analysis"]);
    expect(JSON.stringify(request?.contents)).toContain('"mimeType":"image/jpeg"');
    expect(request?.systemInstruction).toContain("Never estimate AQI");
    expect(analysis).toMatchObject({
      category: "waste_burning",
      confidence: 0.87,
      canSubmit: true,
      model: "gemini-test",
      promptVersion: "photo-analysis/v1",
      analysedAt: now.toISOString(),
    });
    expect(analysis.limitations.slice(0, 2)).toEqual([...FIXED_LIMITATIONS]);
  });

  it("rejects AQI or concentration claims from a photo, then accepts a corrected answer", async () => {
    const generate = model({ observations: ["Thick smoke, AQI likely around 300"] }, {});
    const analysis = await analysePhoto({ jpeg, generate, now });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(generate.mock.calls[1]?.[0].contents)).toContain("do not state AQI values");
    expect(analysis.observations[0]).not.toMatch(/AQI/);
  });

  it("gives up after a second invalid answer instead of storing it", async () => {
    const generate = model({ observations: ["PM2.5 about 180 µg/m³"] }, { observations: ["PM2.5 about 180 µg/m³"] });
    await expect(analysePhoto({ jpeg, generate, now })).rejects.toBeInstanceOf(PhotoAnalysisError);
  });

  it("marks unusable photos as not submittable and clears the category", async () => {
    const analysis = await analysePhoto({ jpeg, generate: model({ imageUsable: false, imageIssue: "screenshot_or_artwork" }), now });
    expect(analysis).toMatchObject({ canSubmit: false, category: "none_visible", visibleSeverity: "unclear", recommendations: [] });
  });

  it("keeps the category consistent when no pollution is visible", async () => {
    const analysis = await analysePhoto({ jpeg, generate: model({ pollutionVisible: false }), now });
    expect(analysis).toMatchObject({ canSubmit: true, pollutionVisible: false, category: "none_visible" });
  });
});

describe("analysis tokens and submitter hashes", () => {
  const secret = "test-secret-value";
  const sha = "a".repeat(64);
  const now = Date.parse("2026-11-25T10:00:00Z");

  it("binds the analysis to the photo, its content and an expiry", async () => {
    // Three model limitations plus the two fixed ones: the signed shape must accept all five.
    const analysis = await analysePhoto({
      jpeg: stripJpegMetadata(syntheticJpeg()) as Uint8Array,
      generate: model({ limitations: ["Source partly hidden", "Taken from a distance", "Low light"] }),
    });
    expect(analysis.limitations).toHaveLength(5);
    const token = signAnalysis(sha, analysis, now, secret);
    expect(verifyAnalysis(token, sha, analysis, now + 60_000, secret)).toBe(true);
    expect(verifyAnalysis(token, "b".repeat(64), analysis, now, secret)).toBe(false);
    expect(verifyAnalysis(token, sha, { ...analysis, category: "construction_dust" }, now, secret)).toBe(false);
    expect(verifyAnalysis(token, sha, analysis, now + 31 * 60_000, secret)).toBe(false);
    expect(verifyAnalysis(token, sha, analysis, now, "other-secret")).toBe(false);
    expect(verifyAnalysis("garbage", sha, analysis, now, secret)).toBe(false);
  });

  it("hashes client addresses pseudonymously", () => {
    expect(submitterHash("203.0.113.5", secret)).toBe(submitterHash("203.0.113.5", secret));
    expect(submitterHash("203.0.113.5", secret)).not.toBe(submitterHash("203.0.113.6", secret));
    expect(submitterHash("203.0.113.5", secret)).not.toContain("203");
  });
});

describe("report submission validation", () => {
  const base = { category: "smoke", latitude: "26.9124", longitude: "75.7873", consent: "yes", analysis: "{}", token: "1234567890.sig" };

  it("accepts a Jaipur location and strips control characters", () => {
    const parsed = reportSubmissionSchema.safeParse({ ...base, description: "Smoke\u0007 near the park" });
    expect(parsed.success && parsed.data.description).toBe("Smoke near the park");
  });

  it("rejects locations outside Jaipur, links, missing consent and unknown categories", () => {
    expect(reportSubmissionSchema.safeParse({ ...base, latitude: "28.61", longitude: "77.21" }).success).toBe(false);
    expect(reportSubmissionSchema.safeParse({ ...base, description: "see https://spam.example" }).success).toBe(false);
    expect(reportSubmissionSchema.safeParse({ ...base, consent: undefined }).success).toBe(false);
    expect(reportSubmissionSchema.safeParse({ ...base, category: "aliens" }).success).toBe(false);
  });

  it("rounds coordinates to about 110 m", () => {
    expect(roundCoordinate(26.912449)).toBe(26.912);
    expect(isInJaipurArea(26.91, 75.79)).toBe(true);
    expect(isInJaipurArea(19.07, 72.88)).toBe(false);
  });
});
