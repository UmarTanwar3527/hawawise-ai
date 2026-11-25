import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { getServerEnv } from "@/config/env";

import type { ModelContent } from "@/lib/gemini/types";

/**
 * Conversations are not stored (no accounts yet), so the browser sends recent
 * history back with each question. Assistant turns are signed by the server;
 * unsigned or altered assistant turns are dropped, so a user cannot put words
 * in Air Guardian's mouth.
 */

function signingKey(): Buffer {
  const secret = getServerEnv().GEMINI_API_KEY ?? "";
  // Domain-separated key derived from a server secret.
  return createHash("sha256").update(`hawa-ai/guardian-history/v1|${secret}`).digest();
}

export function signAssistantText(text: string, key: Buffer = signingKey()): string {
  return createHmac("sha256", key).update(text).digest("base64url");
}

export function verifyAssistantText(text: string, signature: string | undefined, key: Buffer = signingKey()): boolean {
  if (!signature) return false;
  const expected = Buffer.from(signAssistantText(text, key));
  const provided = Buffer.from(signature);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

type HistoryItem = { role: "user" | "assistant"; text: string; signature?: string };

/** Converts trusted history into model turns (last 8 turns, signed assistant turns only). */
export function historyToContents(history: HistoryItem[], key?: Buffer): ModelContent[] {
  return history
    .filter((item) => item.role === "user" || verifyAssistantText(item.text, item.signature, key))
    .slice(-8)
    .map((item) => ({
      role: item.role === "user" ? "user" : "model",
      parts: [{ text: item.text.slice(0, 2000) }],
    }));
}
