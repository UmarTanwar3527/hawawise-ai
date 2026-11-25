import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { haversineKm } from "@/features/air-quality/services/area-air-quality";
import { isValidBearer } from "@/lib/security/bearer";
import { fetchJson, mapWithConcurrency, ProviderError } from "@/services/providers/http";

const schema = z.object({ ok: z.boolean() });
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("fetchJson", () => {
  const noSleep = vi.fn(async () => {});

  it("retries transient server errors, then succeeds", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json({ ok: true }));
    await expect(
      fetchJson("https://example.test", { provider: "test", schema, fetchImpl, sleep: noSleep }),
    ).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry client errors", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({}, 400));
    await expect(
      fetchJson("https://example.test", { provider: "test", schema, fetchImpl, sleep: noSleep }),
    ).rejects.toMatchObject({ kind: "http", status: 400 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("honours Retry-After on 429", async () => {
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, 429, { "retry-after": "2" }))
      .mockResolvedValueOnce(json({ ok: true }));
    await fetchJson("https://example.test", { provider: "test", schema, fetchImpl, sleep });
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("rejects responses that do not match the schema, without retrying", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ unexpected: 1 }));
    await expect(
      fetchJson("https://example.test", { provider: "test", schema, fetchImpl, sleep: noSleep }),
    ).rejects.toMatchObject({ kind: "invalid_response" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("classifies timeouts and gives up after the retry budget", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));
    const error = await fetchJson("https://example.test", {
      provider: "test",
      schema,
      fetchImpl,
      sleep: noSleep,
      retries: 2,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ kind: "timeout" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("never includes the request URL in error messages", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({}, 401));
    const error: unknown = await fetchJson("https://example.test/?api_key=secret", {
      provider: "test",
      schema,
      fetchImpl,
      sleep: noSleep,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).message).not.toContain("secret");
  });
});

describe("mapWithConcurrency", () => {
  it("preserves order and respects the limit", async () => {
    let running = 0;
    let peak = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return n * 10;
    });
    expect(result).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe("isValidBearer", () => {
  const secret = "a".repeat(64);
  it("accepts only the exact bearer token", () => {
    expect(isValidBearer(`Bearer ${secret}`, secret)).toBe(true);
    expect(isValidBearer(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isValidBearer(secret, secret)).toBe(false);
    expect(isValidBearer(null, secret)).toBe(false);
  });
});

describe("haversineKm", () => {
  it("measures one degree of latitude as about 111 km", () => {
    expect(haversineKm({ latitude: 26, longitude: 75 }, { latitude: 27, longitude: 75 })).toBeCloseTo(111.2, 0);
  });
});
