"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Markdown } from "@/components/ui/markdown";

import type { PlanRequest } from "../schemas/plan-request";

type State =
  | { kind: "idle" }
  | { kind: "loading"; language: "en" | "hi" }
  | { kind: "ok"; text: string; language: "en" | "hi" }
  | { kind: "ungrounded" }
  | { kind: "error"; message: string };

/**
 * On-demand AI explanation of the calculated comparison. The server recalculates
 * the plan from stored data; only the visitor's choices are sent.
 */
export function PlanExplanation({ request, enabled }: { request: PlanRequest; enabled: boolean }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  const explain = async (language: "en" | "hi") => {
    setState({ kind: "loading", language });
    try {
      const response = await fetch("/api/planner/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...request, language }),
      });
      const body = (await response.json().catch(() => null)) as
        | { status?: string; explanation?: string; error?: { message?: string } }
        | null;
      if (!response.ok) {
        setState({ kind: "error", message: body?.error?.message ?? "The AI explanation is unavailable right now." });
      } else if (body?.status === "ok" && body.explanation) {
        setState({ kind: "ok", text: body.explanation, language });
      } else {
        setState({ kind: "ungrounded" });
      }
    } catch {
      setState({ kind: "error", message: "Could not reach Hawa AI. Check your connection and try again." });
    }
  };

  const loading = state.kind === "loading";

  return (
    <Card>
      <CardHeader
        title="AI explanation"
        description="Gemini explains the comparison above. It cannot change the ranking, and every figure is checked against the data."
        action={
          <Badge tone="info">
            <Icon name="sparkle" size={12} />
            AI-generated
          </Badge>
        }
      />
      <div className="flex flex-col gap-4 p-5">
        {!enabled ? (
          <p className="text-sm text-ink-muted">AI explanations are not configured. The comparison above does not depend on AI.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={loading} onClick={() => explain("en")}>
              <Icon name="sparkle" size={14} />
              {loading && state.language === "en" ? "Explaining…" : "Explain in English"}
            </Button>
            <Button type="button" variant="secondary" size="sm" disabled={loading} onClick={() => explain("hi")} lang="hi">
              <Icon name="sparkle" size={14} />
              {loading && state.language === "hi" ? "समझा रहे हैं…" : "हिंदी में समझाएँ"}
            </Button>
          </div>
        )}

        <div aria-live="polite">
          {state.kind === "ok" ? (
            <div lang={state.language} className="rounded-lg border border-line bg-canvas p-4 text-sm leading-relaxed text-ink">
              <Markdown text={state.text} />
            </div>
          ) : null}
          {state.kind === "ungrounded" ? (
            <p className="rounded-lg border border-line bg-canvas p-4 text-sm text-ink-muted">
              The AI could not produce an explanation whose figures match the data, so none is shown. The comparison above is unaffected.
            </p>
          ) : null}
          {state.kind === "error" ? (
            <p role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
              {state.message}
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
