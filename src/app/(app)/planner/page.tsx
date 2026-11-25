import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import {
  withCurrentForecastFreshness,
  withCurrentFreshness,
  type AreaAirQuality,
  type AreaForecast,
  type AreaSummary,
} from "@/features/air-quality/services/area-air-quality";
import {
  getAreaAirQualityCached,
  getAreaForecastCached,
  getAreasCached,
} from "@/features/air-quality/services/dashboard-data";
import { PLANNER_FORECAST_HOURS } from "@/features/exposure-planner/constants";
import { ExplanationCard } from "@/features/ai-guardian/components/explanation-card";
import { PlannerForm } from "@/features/exposure-planner/components/planner-form";
import { PlanSummary } from "@/features/exposure-planner/components/plan-summary";
import { planRequestFromSearchParams } from "@/features/exposure-planner/schemas/plan-request";
import { planExposure } from "@/features/exposure-planner/services/plan";
import { isGeminiConfigured } from "@/lib/gemini/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Exposure planner",
};

export default function PlannerPage({ searchParams }: PageProps<"/planner">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Plan your day"
        title="Exposure planner"
        description="Compare start times for an outdoor activity using the air-quality forecast. Hawa AI ranks the times in code; AI only explains the result."
      />
      <Suspense fallback={<PlannerSkeleton />}>
        <PlannerContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function PlannerContent({ searchParams }: { searchParams: PageProps<"/planner">["searchParams"] }) {
  const parsed = planRequestFromSearchParams(await searchParams);
  if (!parsed.success) notFound();
  const request = parsed.data;

  if (!isSupabaseConfigured()) {
    return (
      <Card>
        <ErrorState title="Air-quality storage is not configured" description="Set the Supabase environment variables to load data." />
      </Card>
    );
  }

  let areas: AreaSummary[];
  try {
    areas = await getAreasCached();
  } catch (error) {
    console.error("planner areas failed", error instanceof Error ? error.name : "unknown");
    return <DataUnavailable />;
  }
  if (!areas.some((area) => area.slug === request.location)) notFound();

  let forecast: AreaForecast;
  let current: AreaAirQuality;
  try {
    [forecast, current] = await Promise.all([
      getAreaForecastCached(request.location, PLANNER_FORECAST_HOURS),
      getAreaAirQualityCached(request.location),
    ]);
  } catch (error) {
    console.error("planner data failed", error instanceof Error ? error.name : "unknown");
    return <DataUnavailable />;
  }

  // Windows and freshness depend on the current time, not on when data was cached.
  await connection();
  const now = new Date();
  const plan = planExposure({ forecast: withCurrentForecastFreshness(forecast, now), request, now });

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-5">
        <PlannerForm areas={areas} value={request} />
      </Card>
      <PlanSummary plan={plan} current={withCurrentFreshness(current, now)} />
      {plan.status === "ok" ? (
        <ExplanationCard
          endpoint="/api/planner/explain"
          payload={request}
          enabled={isGeminiConfigured()}
          description="Gemini explains the comparison above. It cannot change the ranking, and every figure is checked against the data."
          basis="The comparison above does not depend on AI."
        />
      ) : null}
      <details className="rounded-card border border-line bg-surface p-5 text-sm text-ink-muted shadow-card">
        <summary className="cursor-pointer font-semibold text-ink">How the planner works</summary>
        <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5">
          <li>Reads the stored hourly Open-Meteo forecast for the area (modelled, not measured).</li>
          <li>Lists every start time in your range that fits the activity, using consecutive forecast hours.</li>
          <li>Ranks complete windows by mean forecast PM2.5 (then peak PM2.5, then PM10). Windows with missing values are not ranked.</li>
          <li>Calls a difference meaningful only if it is at least 5 µg/m³ and 15%; otherwise it says timing makes little difference.</li>
          <li>Shows the latest measured station AQI as context. Gemini can explain the result but cannot change it.</li>
        </ol>
      </details>
    </div>
  );
}

function DataUnavailable() {
  return (
    <Card>
      <ErrorState
        title="Forecast data is temporarily unavailable"
        description="We could not load stored forecasts. Nothing is shown rather than guessing."
      >
        <ButtonLink href="/planner">
          <Icon name="refresh" size={16} />
          Try again
        </ButtonLink>
      </ErrorState>
    </Card>
  );
}

function PlannerSkeleton() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading forecast…</span>
      <Skeleton className="h-56 w-full rounded-card" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-96 rounded-card lg:col-span-2" />
        <Skeleton className="h-96 rounded-card" />
      </div>
    </div>
  );
}
