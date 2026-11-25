import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateDailyBriefIfNeeded } from "@/features/ai-guardian/daily-brief/generate";
import type { GenerateFn } from "@/lib/gemini/types";

import { fakeData, NOW, STATIONS } from "./guardian-fixtures";

/** Minimal chainable stand-in for the Supabase calls the brief generator makes. */
function fakeDb(latest: { data_signature: string; generated_at: string } | null) {
  const writes: unknown[] = [];
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    lt: () => Promise.resolve({ error: null }),
    maybeSingle: () => Promise.resolve({ data: latest, error: null }),
    delete: () => chain,
    upsert: (row: unknown) => {
      writes.push(row);
      return Promise.resolve({ error: null });
    },
  };
  return { db: { from: () => chain } as never, writes };
}

const brief = (summary: string) => ({
  name: "submit_brief",
  args: { headline: "Moderate to Poor air across Jaipur", summary, highlights: [], guidance: ["Limit long outdoor exertion."], warnings: [] },
});

function model(turns: ReturnType<typeof brief>[]) {
  const calls = vi.fn<GenerateFn>();
  turns.forEach((turn) =>
    calls.mockResolvedValueOnce({ content: { role: "model", parts: [] }, functionCalls: [turn], text: "", usage: { inputTokens: 0, outputTokens: 0 } }),
  );
  return calls;
}

describe("AI daily air brief", () => {
  it("does not call the model when there is too little fresh data", async () => {
    const generate = model([]);
    const { db } = fakeDb(null);
    const stale = fakeData({ getStations: async () => STATIONS.map((s) => ({ ...s, observedAt: new Date(NOW.getTime() - 10 * 3_600_000).toISOString() })) });
    expect(await generateDailyBriefIfNeeded({ db, data: stale, generate, model: "m" })).toEqual({ status: "insufficient_data" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("skips generation when the data has not meaningfully changed", async () => {
    const generate = model([]);
    const signature = `2026-11-25|Mansarovar Sector-12:poor,Police Commissionerate:moderate`;
    const { db } = fakeDb({ data_signature: signature, generated_at: new Date(NOW.getTime() - 3_600_000).toISOString() });
    expect(await generateDailyBriefIfNeeded({ db, data: fakeData(), generate, model: "m" })).toEqual({ status: "unchanged" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("generates and stores a grounded brief with server-built evidence", async () => {
    const generate = model([brief("Calculated CPCB AQI ranged from 140 to 242 at stations.")]);
    const { db, writes } = fakeDb(null);
    const outcome = await generateDailyBriefIfNeeded({ db, data: fakeData(), generate, model: "gemini-x" });
    expect(outcome.status).toBe("generated");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ model: "gemini-x", prompt_version: "daily-brief/v1" });
    expect(JSON.stringify((writes[0] as { evidence: unknown }).evidence)).toContain("measured");
  });

  it("stores nothing when the model's figures are not in the data", async () => {
    const generate = model([brief("AQI is 999 everywhere."), brief("AQI is 999 everywhere.")]);
    const { db, writes } = fakeDb(null);
    expect(await generateDailyBriefIfNeeded({ db, data: fakeData(), generate, model: "m" })).toMatchObject({ status: "failed" });
    expect(writes).toHaveLength(0);
  });
});

describe("Gemini client", () => {
  const generateContent = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    generateContent.mockReset();
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "primary-model");
    vi.stubEnv("GEMINI_FALLBACK_MODELS", "fallback-model");
    vi.doMock("@google/genai", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@google/genai")>()),
      GoogleGenAI: class {
        models = { generateContent };
      },
    }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@google/genai");
  });

  const ok = {
    candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "submit_answer", args: { answer: "x", language: "en" } } }] } }],
    functionCalls: [{ name: "submit_answer", args: { answer: "x", language: "en" } }],
    text: "",
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
  };
  const request = { systemInstruction: "s", contents: [], tools: [], allowedTools: ["submit_answer"] };

  it("falls back to the next model when the primary is over quota, without retrying the quota error", async () => {
    generateContent.mockRejectedValueOnce(Object.assign(new Error("quota"), { status: 429 })).mockResolvedValueOnce(ok);
    const { generateWithGemini } = await import("@/lib/gemini/client");
    const result = await generateWithGemini(request);
    expect(result.functionCalls[0]?.name).toBe("submit_answer");
    expect(generateContent.mock.calls.map((call) => call[0].model)).toEqual(["primary-model", "fallback-model"]);
  });

  it("retries capacity errors (503) on the same model with back-off before falling back", async () => {
    vi.useFakeTimers();
    try {
      const unavailable = () => Object.assign(new Error("high demand"), { status: 503 });
      generateContent.mockRejectedValueOnce(unavailable()).mockRejectedValueOnce(unavailable()).mockResolvedValueOnce(ok);
      const { generateWithGemini } = await import("@/lib/gemini/client");
      const pending = generateWithGemini(request);
      await vi.advanceTimersByTimeAsync(10_000);
      expect((await pending).functionCalls[0]?.name).toBe("submit_answer");
      expect(generateContent.mock.calls.map((call) => call[0].model)).toEqual(["primary-model", "primary-model", "primary-model"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops retrying within its time budget and reports the model as unavailable", async () => {
    vi.useFakeTimers();
    try {
      generateContent.mockRejectedValue(Object.assign(new Error("high demand"), { status: 503 }));
      const { generateWithGemini, GEMINI_LIMITS } = await import("@/lib/gemini/client");
      const started = Date.now();
      const pending = generateWithGemini(request).catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(GEMINI_LIMITS.budgetMs + 5_000);
      expect(await pending).toMatchObject({ kind: "unavailable" });
      expect(Date.now() - started).toBeLessThanOrEqual(GEMINI_LIMITS.budgetMs + 5_000);
      // Retries on the primary, then the fallback model, all bounded.
      expect(generateContent.mock.calls.length).toBeLessThanOrEqual(8);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not fall back on invalid requests", async () => {
    generateContent.mockRejectedValue(Object.assign(new Error("bad"), { status: 400 }));
    const { generateWithGemini } = await import("@/lib/gemini/client");
    await expect(generateWithGemini(request)).rejects.toMatchObject({ kind: "invalid_request" });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("reports not_configured without a key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const { generateWithGemini, isGeminiConfigured } = await import("@/lib/gemini/client");
    expect(isGeminiConfigured()).toBe(false);
    await expect(generateWithGemini(request)).rejects.toMatchObject({ kind: "not_configured" });
  });
});
