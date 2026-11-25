"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Markdown } from "@/components/ui/markdown";
import { cn } from "@/lib/utils/cn";
import { formatDateTimeIst } from "@/lib/utils/format";

import type { Evidence, GuardianResponse } from "../schemas/response";

type ChatMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string; signature: string; response: GuardianResponse }
  | { id: string; role: "error"; text: string };

const SUGGESTIONS = [
  "What is the current air quality in Jaipur?",
  "Why is the air quality poor today? Explain using actual data.",
  "Compare Jaipur's monitoring stations.",
  "Jaipur ki aaj ki air quality simple Hindi mein samjhao.",
  "How has PM2.5 changed in the last 24 hours?",
  "Explain the forecast for the next two days.",
];

const STORAGE_KEY = "hawa-guardian-chat-v1";
const KIND_TONES: Record<Evidence["dataKind"], BadgeTone> = {
  measured: "success",
  modelled: "info",
  forecast: "warning",
  reference: "neutral",
};
const KIND_LABELS: Record<Evidence["dataKind"], string> = {
  measured: "Measured",
  modelled: "Modelled",
  forecast: "Forecast",
  reference: "Reference",
};

function loadMessages(): ChatMessage[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChatMessage[]).slice(-30) : [];
  } catch {
    return [];
  }
}

export function GuardianChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

  useEffect(() => {
    // Restoring per-tab history from sessionStorage must happen after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(loadMessages());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      // Storage unavailable (private mode); the chat still works for this page view.
    }
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, hydrated]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || pending) return;
    const history = messages
      .filter((m): m is Extract<ChatMessage, { role: "user" | "assistant" }> => m.role !== "error")
      .slice(-8)
      .map((m) => (m.role === "assistant" ? { role: m.role, text: m.text, signature: m.signature } : { role: m.role, text: m.text }));

    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text }]);
    setInput("");
    setPending(true);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const body = (await response.json().catch(() => null)) as
        | (GuardianResponse & { signature: string })
        | { error?: { message?: string } }
        | null;
      if (!response.ok || !body || !("answer" in body)) {
        const message = body && "error" in body && body.error?.message ? body.error.message : "Air Guardian could not answer right now.";
        setMessages((current) => [...current, { id: crypto.randomUUID(), role: "error", text: message }]);
      } else {
        setMessages((current) => [
          ...current,
          { id: crypto.randomUUID(), role: "assistant", text: body.answer, signature: body.signature, response: body },
        ]);
      }
    } catch {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "error", text: "Network error. Check your connection and try again." }]);
    } finally {
      setPending(false);
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void ask(input);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void ask(input);
    }
  };

  return (
    <div className="flex min-h-[560px] flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="grid size-7 place-items-center rounded-lg bg-primary-soft text-primary">
            <Icon name="sparkle" size={16} />
          </span>
          Air Guardian
        </p>
        {messages.length ? (
          <Button variant="ghost" size="sm" onClick={() => setMessages([])} disabled={pending}>
            New chat
          </Button>
        ) : null}
      </div>

      <div ref={logRef} role="log" aria-live="polite" aria-label="Conversation" className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
        {messages.length === 0 ? (
          <div className="m-auto flex max-w-xl flex-col items-center gap-5 py-6 text-center">
            <div>
              <h2 className="text-lg font-semibold text-ink">Ask about Jaipur&apos;s air</h2>
              <p className="mt-1 text-sm leading-6 text-ink-muted">
                Answers use the same stored station and model data as the dashboard, with sources and times. English or Hindi.
              </p>
            </div>
            <ul className="grid w-full gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((suggestion) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    onClick={() => void ask(suggestion)}
                    disabled={pending}
                    className="h-full w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-left text-sm text-ink transition hover:border-primary/40 hover:bg-primary-soft"
                  >
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          messages.map((message) => <MessageView key={message.id} message={message} />)
        )}
        {pending ? (
          <p role="status" className="flex items-center gap-2 text-sm text-ink-subtle">
            <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-primary" />
            Working on it…
          </p>
        ) : null}
      </div>

      <form onSubmit={onSubmit} className="border-t border-line p-3 sm:p-4">
        <label htmlFor={inputId} className="sr-only">
          Ask Air Guardian
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id={inputId}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={1000}
            placeholder="Ask about air quality in Jaipur…"
            className="max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-line-control bg-surface px-3 py-2.5 text-sm text-ink"
          />
          <Button type="submit" disabled={pending || !input.trim()} className="h-11">
            <Icon name="arrowRight" size={16} />
            <span className="sr-only sm:not-sr-only">Ask</span>
          </Button>
        </div>
        <p className="mt-2 text-[11px] leading-4 text-ink-subtle">
          AI-generated answers from stored data. General information, not medical advice. Chats are kept only in this browser tab.
        </p>
      </form>
    </div>
  );
}

function MessageView({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-6 text-white">
        {message.text}
      </div>
    );
  }
  if (message.role === "error") {
    return (
      <div role="alert" className="flex max-w-[90%] gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
        {message.text}
      </div>
    );
  }

  const { response } = message;
  return (
    <article className="flex max-w-[95%] flex-col gap-3" lang={response.language}>
      {response.toolCalls.length ? (
        <ul aria-label="What Air Guardian did" className="flex flex-wrap gap-1.5">
          {response.toolCalls.map((call, index) => (
            <li key={index} className={cn("flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px]", call.ok ? "border-line text-ink-muted" : "border-yellow-200 bg-yellow-50 text-yellow-800")}>
              <Icon name={call.ok ? "check" : "alert"} size={11} />
              {call.label}
            </li>
          ))}
        </ul>
      ) : null}

      <div className={cn("rounded-2xl rounded-tl-md border px-4 py-3", response.grounded ? "border-line bg-canvas" : "border-yellow-200 bg-yellow-50")}>
        {!response.grounded ? (
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-yellow-800">
            <Icon name="alert" size={12} />
            Could not be verified against stored data
          </p>
        ) : null}
        <Markdown text={response.answer} />
        {response.recommendations.length ? (
          <div className="mt-3 border-t border-line pt-3">
            <p className="text-xs font-semibold text-ink">{response.language === "hi" ? "सुझाव" : "Practical guidance"}</p>
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-sm leading-6 text-ink-muted">
              {response.recommendations.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {response.warnings.length ? (
        <ul className="flex flex-col gap-1">
          {response.warnings.map((warning, index) => (
            <li key={index} className="flex gap-1.5 text-xs leading-5 text-yellow-800">
              <Icon name="alert" size={12} className="mt-0.5 shrink-0" />
              {warning}
            </li>
          ))}
        </ul>
      ) : null}

      {response.evidence.length ? (
        <details className="group rounded-xl border border-line">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-ink">
            Sources and evidence ({response.evidence.length})
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 text-ink-subtle transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </summary>
          <ul className="flex flex-col divide-y divide-line border-t border-line">
            {response.evidence.map((item, index) => (
              <li key={index} className="flex flex-col gap-1 px-3 py-2 text-xs">
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone={KIND_TONES[item.dataKind]}>{KIND_LABELS[item.dataKind]}</Badge>
                  <span className="font-medium text-ink">{item.station ?? item.source}</span>
                </span>
                {item.station ? <span className="text-ink-subtle">{item.source}</span> : null}
                {item.observedAt ? (
                  <span className="text-ink-subtle">
                    {item.dataKind === "forecast" ? "From" : "Data time"} {formatDateTimeIst(item.observedAt)}
                    {item.fetchedAt ? ` · fetched ${formatDateTimeIst(item.fetchedAt)}` : ""}
                  </span>
                ) : null}
                {item.aqiStandard ? <span className="text-ink-subtle">{item.aqiStandard}</span> : null}
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="w-fit text-primary hover:underline">
                    Open source
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}
