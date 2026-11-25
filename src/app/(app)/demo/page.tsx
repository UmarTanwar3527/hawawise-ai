import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getServerEnv } from "@/config/env";
import { MEASURED_STALE_AFTER_HOURS } from "@/features/air-quality/constants";
import { withCurrentForecastFreshness } from "@/features/air-quality/services/area-air-quality";
import { getAreaForecastCached, getLatestDailyBrief, getMapData } from "@/features/air-quality/services/dashboard-data";
import { loadCityInsights } from "@/features/city-insights/services/data";
import { isGeminiConfigured } from "@/lib/gemini/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cn } from "@/lib/utils/cn";
import { formatAge, formatDateTimeIst } from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "Guided demo",
};

const HOUR = 3_600_000;
const GUARDIAN_QUESTION = "Why is Jaipur's air quality like this today, and what should I do?";

type Scene = {
  title: string;
  seconds: number;
  href: string;
  cta: string;
  icon: IconName;
  show: string[];
  say: string;
};

/** The demo script from the submission plan, pointing at live pages. */
const SCENES: Scene[] = [
  {
    title: "The problem",
    seconds: 15,
    href: "/",
    cta: "Open the landing page",
    icon: "home",
    show: ["The promise: air-quality intelligence you can trace to its source."],
    say: "Millions of people breathe polluted air every day, but an AQI number alone isn't enough. People need to know what is happening, why, and what they can do.",
  },
  {
    title: "Live environmental intelligence",
    seconds: 25,
    href: "/dashboard",
    cta: "Open the dashboard",
    icon: "grid",
    show: [
      "Current AQI from the nearest monitoring station, with station name and time.",
      "Measured, modelled and forecast badges: they are never mixed.",
      "The AI daily air brief, generated on a schedule from real data.",
    ],
    say: "Every value shows where it came from and when. Station measurements lead; model estimates are labelled.",
  },
  {
    title: "Air Guardian",
    seconds: 45,
    href: `/guardian?q=${encodeURIComponent(GUARDIAN_QUESTION)}`,
    cta: "Ask Air Guardian",
    icon: "chat",
    show: [
      "Press Ask: the tool chips show the data it retrieved.",
      "Open \"Sources and evidence\" to show stations and times.",
      "Then type: \"Mujhe simple Hindi mein samjhao\".",
    ],
    say: "The AI does not guess. It calls our data tools, and every number it states is checked against what it retrieved.",
  },
  {
    title: "Exposure planner",
    seconds: 30,
    href: "/planner?location=mansarovar&activity=running&duration=45&day=tomorrow&from=5&to=22",
    cta: "Plan a run",
    icon: "calendar",
    show: [
      "The comparatively preferable window, ranked in code from the forecast.",
      "The hourly chart and the caveat that preferable is not safe.",
      "Press \"हिंदी में समझाएँ\" for the AI explanation.",
    ],
    say: "Code ranks the time windows from real forecast data; the AI only explains the result.",
  },
  {
    title: "AI photo reporter",
    seconds: 40,
    href: "/reports/new",
    cta: "Report pollution",
    icon: "flag",
    show: [
      "Upload a photo of smoke or dust: category, confidence, observations, limitations.",
      "Point out: a photo never produces an AQI, and location data is removed.",
      "Submitting creates a real public report; only submit a genuine one.",
    ],
    say: "Citizens become contributors. Gemini vision turns a photo into a structured, honest report.",
  },
  {
    title: "City intelligence",
    seconds: 25,
    href: "/insights",
    cta: "Open City insights",
    icon: "chart",
    show: [
      "The daily rhythm: when PM2.5 peaks and when it is lowest.",
      "Station comparison over 7 days, then the AI interpretation.",
      "Optionally show community reports on the pollution map.",
    ],
    say: "Statistics are calculated in code; the AI interprets them for residents.",
  },
];

const CLOSING = "Hawa AI turns air-quality data into intelligence, intelligence into decisions, and citizens into participants in cleaner cities.";

export default function DemoPage() {
  const total = SCENES.reduce((sum, scene) => sum + scene.seconds, 0) + 10;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Guide"
        title="Guided demo"
        description={`A ${Math.round(total / 60)}-minute path through Hawa AI. Everything runs on live Jaipur data; nothing here is simulated.`}
      />
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-card" />}>
        <Readiness />
      </Suspense>

      <ol className="flex flex-col gap-4">
        {SCENES.map((scene, index) => (
          <li key={scene.title}>
            <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                <Icon name={scene.icon} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-ink">
                    {index + 1}. {scene.title}
                  </h2>
                  <Badge tone="neutral">{scene.seconds} s</Badge>
                </div>
                <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink-muted">
                  {scene.show.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p className="border-l-2 border-primary pl-3 text-sm text-ink italic">&ldquo;{scene.say}&rdquo;</p>
              </div>
              <ButtonLink href={scene.href} variant="secondary" size="sm" className="self-start">
                {scene.cta}
                <Icon name="arrowRight" size={14} />
              </ButtonLink>
            </Card>
          </li>
        ))}
        <li>
          {/* Not a Card: cn() does not merge conflicting backgrounds, so the navy surface is set here. */}
          <div className="rounded-card bg-navy p-5 text-white shadow-card">
            <h2 className="font-semibold">{SCENES.length + 1}. Closing (10 s)</h2>
            <p className="mt-2 text-sm text-slate-200 italic">&ldquo;{CLOSING}&rdquo;</p>
          </div>
        </li>
      </ol>

      <Card>
        <CardHeader title="Before you present" />
        <ul className="flex list-disc flex-col gap-2 p-5 pl-10 text-sm text-ink-muted">
          <li>
            Gemini free-tier quotas are small. Each Air Guardian answer uses 2–5 model requests, and each explanation or photo
            analysis uses 1–2. Rehearse sparingly on the day and check your limits in Google AI Studio.
          </li>
          <li>Open the tabs in advance. Explanations for the same data are cached for 30 minutes, so a rehearsed one returns instantly.</li>
          <li>Station data reaches OpenAQ a few hours after measurement; the dashboard shows the exact time.</li>
          <li>Use a genuine photo for the reporter, or stop before submitting: submitted reports are public.</li>
        </ul>
      </Card>
    </div>
  );
}

type Check = { label: string; status: "ok" | "warn" | "fail"; detail: string };

async function Readiness() {
  await connection();
  const now = new Date();
  const checks: Check[] = [];
  const configured = isSupabaseConfigured();

  if (!configured) {
    checks.push({ label: "Data storage", status: "fail", detail: "Supabase is not configured on this deployment." });
  } else {
    const [map, forecast, brief, insights] = await Promise.all([
      getMapData().catch(() => null),
      getAreaForecastCached("jaipur-city-centre", 48).catch(() => null),
      getLatestDailyBrief().catch(() => null),
      loadCityInsights(now).catch(() => null),
    ]);

    if (!map) checks.push({ label: "Station measurements", status: "fail", detail: "Stored station data could not be read." });
    else {
      const times = map.stations.flatMap((s) => (s.observedAt ? [Date.parse(s.observedAt)] : []));
      const latest = times.length ? Math.max(...times) : null;
      const fresh = map.stations.filter((s) => s.observedAt && now.getTime() - Date.parse(s.observedAt) <= MEASURED_STALE_AFTER_HOURS * HOUR).length;
      const ageMinutes = latest ? Math.round((now.getTime() - latest) / 60_000) : null;
      checks.push({
        label: "Station measurements",
        status: ageMinutes === null ? "fail" : ageMinutes <= MEASURED_STALE_AFTER_HOURS * 60 && fresh >= 4 ? "ok" : ageMinutes <= 12 * 60 ? "warn" : "fail",
        detail:
          latest && ageMinutes !== null
            ? `Latest ${formatDateTimeIst(new Date(latest).toISOString())} (${formatAge(ageMinutes)} ago); ${fresh} of ${map.stations.length} stations current.`
            : "No recent station data. Check the hourly ingestion workflow.",
      });
    }

    if (!forecast) checks.push({ label: "Forecast", status: "fail", detail: "The forecast could not be read." });
    else {
      const current = withCurrentForecastFreshness(forecast, now);
      checks.push({
        label: "Forecast",
        status: current.hours.length === 0 ? "fail" : current.isStale ? "warn" : "ok",
        detail: current.fetchedAt
          ? `${current.hours.length} forecast hours; fetched ${formatDateTimeIst(current.fetchedAt)}.`
          : "No forecast stored.",
      });
    }

    checks.push(
      brief
        ? {
            label: "AI daily brief",
            status: now.getTime() - Date.parse(brief.generatedAt) <= 6 * HOUR ? "ok" : "warn",
            detail: `Generated ${formatDateTimeIst(brief.generatedAt)}. It refreshes when conditions change or every 3 hours.`,
          }
        : { label: "AI daily brief", status: "warn", detail: "No brief yet; the dashboard shows an honest empty state." },
    );

    const days = insights?.insights.daily.filter((d) => d.pm25 !== null).length ?? 0;
    checks.push({
      label: "History for City insights",
      status: days >= 7 ? "ok" : days >= 3 ? "warn" : "fail",
      detail: `${days} of 7 complete days with station data${insights ? `; coverage ${insights.insights.coverage.percent}%` : ""}.`,
    });
  }

  const gemini = isGeminiConfigured();
  checks.push({
    label: "AI (Gemini)",
    status: gemini ? "ok" : "fail",
    detail: gemini ? "Configured. Quota is not checked here, to avoid spending it." : "GEMINI_API_KEY is not set.",
  });
  checks.push({
    label: "Photo reporting",
    status: gemini && configured && getServerEnv().SUPABASE_SERVICE_ROLE_KEY ? "ok" : "fail",
    detail: gemini && configured ? "Analysis and private storage configured." : "Needs Gemini and Supabase server keys.",
  });

  const ready = checks.every((c) => c.status === "ok");
  const failing = checks.some((c) => c.status === "fail");

  return (
    <Card>
      <CardHeader
        title="Demo readiness"
        description={`Checked ${formatDateTimeIst(now.toISOString())} from stored data. No provider or AI calls are made.`}
        action={<Badge tone={ready ? "success" : failing ? "danger" : "warning"}>{ready ? "Ready" : failing ? "Not ready" : "Ready with notes"}</Badge>}
      />
      <ul className="grid gap-3 p-5 sm:grid-cols-2">
        {checks.map((check) => (
          <li key={check.label} className="flex gap-3 rounded-lg border border-line p-3">
            <span
              className={cn(
                "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
                check.status === "ok" ? "bg-green-50 text-green-700" : check.status === "warn" ? "bg-yellow-50 text-yellow-800" : "bg-red-50 text-red-700",
              )}
            >
              <Icon name={check.status === "ok" ? "check" : "alert"} size={14} />
              <span className="sr-only">{check.status === "ok" ? "OK" : check.status === "warn" ? "Warning" : "Problem"}</span>
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">{check.label}</span>
              <span className="block text-xs text-ink-muted">{check.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
