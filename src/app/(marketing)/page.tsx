import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCoordinates, siteConfig } from "@/config/site";
import { AqiScaleLegend } from "@/features/air-quality/components/aqi-scale-legend";
import { ProvenanceBadge } from "@/features/air-quality/components/provenance-badge";
import { CPCB_AQI_CATEGORIES } from "@/features/air-quality/cpcb-aqi-scale";
import { withCurrentFreshness } from "@/features/air-quality/services/area-air-quality";
import { getAreaAirQualityCached } from "@/features/air-quality/services/dashboard-data";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cn } from "@/lib/utils/cn";
import { formatAge, formatTimeIst } from "@/lib/utils/format";

const principles: { step: string; title: string; body: string }[] = [
  {
    step: "01",
    title: "Data first",
    body: "Readings come from identified providers, keep their AQI standard, and carry observation and fetch times.",
  },
  {
    step: "02",
    title: "AI second",
    body: "The assistant reasons only over data it has retrieved through audited tools. It never invents values or sources.",
  },
  {
    step: "03",
    title: "Actionable intelligence third",
    body: "Guidance is practical, states its uncertainty, and never promises that an activity is completely safe.",
  },
];

const integrityRules: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "layers",
    title: "AQI standards are never mixed",
    body: "India's CPCB AQI is used where available. Another scale is never silently substituted for it.",
  },
  {
    icon: "database",
    title: "Every value is labelled",
    body: "Measured station data, modelled area estimates and forecasts are visibly distinguished.",
  },
  {
    icon: "clock",
    title: "Freshness is visible",
    body: "Each reading shows who supplied it, when it applies and when Hawa AI fetched it.",
  },
  {
    icon: "shield",
    title: "Honest when data is missing",
    body: "If a provider is unavailable or stale, Hawa AI says so instead of filling the gap.",
  },
];

/** The five questions Hawa AI answers, each mapped to the module that answers it. */
const questions: { question: string; answer: string; href: string; module: string; icon: IconName }[] = [
  {
    question: "What's happening?",
    answer: "Live station AQI with its source and time, model estimates labelled as such, and a scheduled AI daily brief.",
    href: "/dashboard",
    module: "Dashboard",
    icon: "grid",
  },
  {
    question: "Why is it happening?",
    answer: "Air Guardian retrieves real data through audited tools and explains it in English or Hindi. City insights show trends and daily rhythms.",
    href: "/guardian",
    module: "Air Guardian",
    icon: "chat",
  },
  {
    question: "What's likely to happen?",
    answer: "Forecasts are shown as forecasts, with their bias stated, and compared hour by hour.",
    href: "/insights",
    module: "City insights",
    icon: "chart",
  },
  {
    question: "What should I do?",
    answer: "The exposure planner ranks outdoor time windows in code from the forecast; AI explains the result.",
    href: "/planner",
    module: "Exposure planner",
    icon: "calendar",
  },
  {
    question: "How can I help my city?",
    answer: "Photograph a pollution source. Gemini vision classifies it, and it appears on the map as a community report.",
    href: "/reports/new",
    module: "Civic reports",
    icon: "flag",
  },
];

const dataSources: { name: string; role: string }[] = [
  {
    name: "OpenAQ — CPCB/RSPCB monitoring stations",
    role: "Primary source. Hourly measurements from six continuous monitoring stations in Jaipur. Hawa AI calculates the CPCB AQI from them and labels it as calculated.",
  },
  {
    name: "Open-Meteo Air Quality",
    role: "Model estimates and forecasts. Always labelled as modelled, and never used to calculate an AQI.",
  },
  {
    name: "India National AQI (CPCB) method",
    role: "Breakpoints and categories used to calculate the AQI. Not an official CPCB feed; values are labelled as calculated by Hawa AI.",
  },
  {
    name: "Google Gemini",
    role: "Explains, classifies and interprets. Runs only on the server, only over retrieved data, and every figure it states is checked.",
  },
  {
    name: "OpenStreetMap",
    role: "Basemap for the pollution map and the report location picker.",
  },
];

export default function LandingPage() {
  const { centre } = siteConfig.pilotCity;

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(ellipse_at_top,rgba(37,99,235,0.10),transparent_65%)]"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-20 lg:pb-28">
          <div>
            <Badge tone="info" dot>
              Pilot · {siteConfig.pilotCity.name}, {siteConfig.pilotCity.state}
            </Badge>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-ink sm:text-5xl lg:text-[3.5rem] lg:leading-[1.05]">
              Air-quality intelligence you can trace to its source.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-ink-muted sm:text-lg">
              {siteConfig.name} turns verified environmental data into clear,
              everyday guidance for {siteConfig.pilotCity.name}, with every value
              labelled by provider, AQI standard and time.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/dashboard" size="lg">
                Open dashboard
                <Icon name="arrowRight" size={18} />
              </ButtonLink>
              <ButtonLink href="/demo" size="lg" variant="secondary">
                <Icon name="sparkle" size={18} />
                Take the guided demo
              </ButtonLink>
            </div>
          </div>

          <Card className="shadow-raised">
            <div className="flex items-start justify-between gap-4 border-b border-line p-5">
              <div>
                <p className="text-sm font-semibold text-ink">
                  {siteConfig.pilotCity.name} city centre
                </p>
                <p className="mt-1 font-mono text-xs text-ink-subtle">
                  {formatCoordinates(centre.latitude, centre.longitude)}
                </p>
              </div>
              <ProvenanceBadge kind="measured" />
            </div>
            <div className="flex flex-col gap-5 p-5">
              <Suspense fallback={<Skeleton className="h-28 w-full rounded-xl" />}>
                <LiveReading />
              </Suspense>
              <AqiScaleLegend />
              <div className="flex flex-wrap gap-2">
                <ProvenanceBadge kind="measured" />
                <ProvenanceBadge kind="modelled" />
                <ProvenanceBadge kind="forecast" />
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Principles */}
      <section id="principles" className="scroll-mt-20 border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-sm font-semibold tracking-wider text-primary uppercase">
            Our engineering principle
          </h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            {principles.map((principle) => (
              <li key={principle.step}>
                <span className="font-mono text-sm text-ink-subtle">{principle.step}</span>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-ink">
                  {principle.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-ink-muted">{principle.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Five questions */}
      <section id="modules" className="scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-ink">Five questions, answered with evidence</h2>
            <p className="mt-3 text-base leading-7 text-ink-muted">
              Six modules on one verified data layer. AI retrieves, explains and classifies; code calculates.
            </p>
          </div>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {questions.map((item) => (
              <li key={item.question}>
                <Link
                  href={item.href}
                  className="group flex h-full flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-card transition hover:border-primary/40 hover:shadow-raised"
                >
                  <span className="grid size-10 place-items-center rounded-lg bg-primary-soft text-primary">
                    <Icon name={item.icon} />
                  </span>
                  <span>
                    <span className="block font-semibold text-ink">{item.question}</span>
                    <span className="mt-1 block text-sm leading-6 text-ink-muted">{item.answer}</span>
                  </span>
                  <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary">
                    {item.module}
                    <Icon name="arrowRight" size={16} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/demo"
                className="group flex h-full flex-col justify-between gap-4 rounded-card bg-navy p-5 text-white shadow-card transition hover:shadow-raised"
              >
                <span>
                  <span className="block font-semibold">See it end to end</span>
                  <span className="mt-1 block text-sm leading-6 text-slate-300">
                    A 3-minute guided tour on live Jaipur data, with readiness checks.
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-blue-300">
                  Guided demo
                  <Icon name="arrowRight" size={16} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          </ul>
        </div>
      </section>

      {/* Data integrity */}
      <section id="data-integrity" className="scroll-mt-20 bg-navy text-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">
              Built to be trusted, not just to look good
            </h2>
            <p className="mt-3 max-w-lg text-base leading-7 text-slate-300">
              If environmental data is unreliable, even the best AI produces
              unreliable advice. These rules apply to every screen and every
              answer.
            </p>
            <ul className="mt-10 grid gap-6 sm:grid-cols-2">
              {integrityRules.map((rule) => (
                <li key={rule.title}>
                  <Icon name={rule.icon} className="text-blue-300" />
                  <h3 className="mt-3 font-semibold">{rule.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-300">{rule.body}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-card border border-white/10 bg-navy-soft p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">Data sources</h3>
              <Badge tone="inverse">Jaipur pilot</Badge>
            </div>
            <ul className="mt-6 flex flex-col divide-y divide-white/10">
              {dataSources.map((source) => (
                <li key={source.name} className="py-4 first:pt-0 last:pb-0">
                  <p className="font-medium">{source.name}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-300">{source.role}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}

/** The latest measured city-centre reading, read from storage (never a provider call). */
async function LiveReading() {
  if (!isSupabaseConfigured()) return <LiveReadingUnavailable />;
  let current;
  try {
    current = await getAreaAirQualityCached("jaipur-city-centre");
  } catch {
    return <LiveReadingUnavailable />;
  }
  await connection();
  const measured = withCurrentFreshness(current, new Date()).measured;
  const aqi = measured?.aqi;
  const category = aqi?.category ? CPCB_AQI_CATEGORIES.find((c) => c.id === aqi.category) : null;
  if (!measured || !aqi || !category) return <LiveReadingUnavailable />;
  return (
    <Link href="/dashboard" className="block rounded-xl border border-line bg-canvas p-5 transition hover:border-primary/40">
      <p className="text-xs font-medium text-ink-subtle">Latest station reading</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-2">
        <span className="text-4xl font-semibold text-ink tabular-nums">
          {aqi.value}
          {aqi.isLowerBound ? "+" : ""}
        </span>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", category.chipClass)}>{category.label}</span>
        {measured.isStale ? <Badge tone="warning">Stale</Badge> : null}
      </p>
      <p className="mt-2 text-xs leading-5 text-ink-subtle">
        India AQI (CPCB), calculated by Hawa AI · {measured.station.name.replace(/, Jaipur - RSPCB$/, "")} ·{" "}
        {formatTimeIst(measured.observedAt)} ({formatAge(measured.ageMinutes)} ago)
      </p>
    </Link>
  );
}

function LiveReadingUnavailable() {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-canvas p-5 text-center">
      <p className="text-sm font-medium text-ink">Live station data on the dashboard</p>
      <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-ink-subtle">
        The latest reading could not be loaded here. Nothing is shown rather than guessing.
      </p>
    </div>
  );
}
