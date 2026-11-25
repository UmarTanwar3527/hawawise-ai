import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { DailyBriefCard } from "@/features/ai-guardian/components/daily-brief-card";
import { AqiScaleLegend } from "@/features/air-quality/components/aqi-scale-legend";
import { CurrentAqiCard } from "@/features/air-quality/components/dashboard/current-aqi-card";
import { ForecastDays } from "@/features/air-quality/components/dashboard/forecast-days";
import { HourlyTrendChart } from "@/features/air-quality/components/dashboard/hourly-trend-chart";
import { JaipurMap } from "@/features/air-quality/components/dashboard/jaipur-map";
import { LocationSelector } from "@/features/air-quality/components/dashboard/location-selector";
import { ModelledCard } from "@/features/air-quality/components/dashboard/modelled-card";
import { PollutantGrid } from "@/features/air-quality/components/dashboard/pollutant-grid";
import { SourceCard } from "@/features/air-quality/components/dashboard/source-card";
import { ProvenanceBadge } from "@/features/air-quality/components/provenance-badge";
import { areaQuerySchema } from "@/features/air-quality/schemas/area-query";
import {
  getDashboardData,
  getKnownAreaSlugs,
  getLatestDailyBrief,
  type DailyBrief,
  type DashboardData,
} from "@/features/air-quality/services/dashboard-data";
import {
  withCurrentForecastFreshness,
  withCurrentFreshness,
} from "@/features/air-quality/services/area-air-quality";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Air dashboard",
};

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Jaipur · Air dashboard"
        title="Air dashboard"
        description="Station measurements lead. Every value shows its source, its time and whether it is measured, modelled or forecast."
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function DashboardContent({ searchParams }: { searchParams: PageProps<"/dashboard">["searchParams"] }) {
  const params = await searchParams;
  const parsed = areaQuerySchema.safeParse({
    location: typeof params.location === "string" ? params.location : undefined,
  });
  if (!parsed.success) notFound();
  const slug = parsed.data.location;

  if (!isSupabaseConfigured()) {
    return (
      <Card>
        <ErrorState title="Air-quality storage is not configured" description="Set the Supabase environment variables to load data." />
      </Card>
    );
  }

  let known: string[];
  try {
    known = await getKnownAreaSlugs();
  } catch (error) {
    console.error("dashboard areas failed", error instanceof Error ? error.name : "unknown");
    return <DataUnavailable slug={slug} />;
  }
  if (!known.includes(slug)) notFound();

  let data: DashboardData;
  let brief: DailyBrief | null = null;
  try {
    data = await getDashboardData(slug);
  } catch (error) {
    console.error("dashboard data failed", error instanceof Error ? error.name : "unknown");
    return <DataUnavailable slug={slug} />;
  }

  try {
    brief = await getLatestDailyBrief();
  } catch (error) {
    // The brief is optional; measured data still renders without it.
    console.error("daily brief read failed", error instanceof Error ? error.name : "unknown");
  }

  // Age and staleness are computed per request, not when the data was cached.
  await connection();
  const now = new Date();
  const generatedAt = now.toISOString();
  const { areas, stations, history } = data;
  const current = withCurrentFreshness(data.current, now);
  const forecast = withCurrentForecastFreshness(data.forecast, now);
  const measured = current.measured;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <LocationSelector areas={areas} value={slug} />
        <p className="text-xs text-ink-subtle">
          {current.location.type === "neighbourhood"
            ? "Areas are interface locations, not monitoring stations."
            : "Jaipur city centre"}
        </p>
      </div>

      {current.unavailable.length > 0 ? (
        <div role="note" className="flex gap-3 rounded-xl border border-line bg-surface p-4 text-sm text-ink-muted">
          <Icon name="info" size={18} className="mt-0.5 shrink-0 text-ink-subtle" />
          <ul className="flex flex-col gap-1">
            {current.unavailable.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <CurrentAqiCard measured={measured} areaName={current.location.name} />
          {measured?.aqi?.category ? (
            <Card className="p-5">
              <AqiScaleLegend activeCategory={measured.aqi.category} />
            </Card>
          ) : null}
        </div>
        <SourceCard current={current} />

        <PollutantGrid
          className="lg:col-span-2"
          pollutants={measured?.pollutants ?? null}
          stationName={measured?.station.name ?? null}
          observedAt={measured?.observedAt ?? null}
        />
        <ModelledCard current={current} />

        <Card className="lg:col-span-2">
          <CardHeader
            title="Hourly trend"
            description={measured ? `Last 24 hours at ${measured.station.name}` : "No station selected"}
            action={history.length ? <ProvenanceBadge kind="measured" /> : null}
          />
          <div className="p-5">
            {history.length >= 2 && measured ? (
              <HourlyTrendChart history={history} stationName={measured.station.name} />
            ) : (
              <EmptyState compact headingLevel="h3" icon="chart" title="Not enough hourly data yet" />
            )}
          </div>
        </Card>
        <DailyBriefCard brief={brief} now={now} />

        <ForecastDays className="lg:col-span-3" forecast={forecast} generatedAt={generatedAt} />

        <Card className="lg:col-span-3">
          <CardHeader
            title="Stations and areas"
            description="Positions to scale, no basemap. Select an area to view it."
          />
          <div className="p-5">
            {stations.length ? (
              <JaipurMap areas={areas} stations={stations} selectedSlug={slug} generatedAt={generatedAt} />
            ) : (
              <EmptyState compact headingLevel="h3" icon="map" title="No stations stored yet" />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function DataUnavailable({ slug }: { slug: string }) {
  return (
    <Card>
      <ErrorState
        title="Air-quality data is temporarily unavailable"
        description="We could not load stored measurements. Nothing is shown rather than guessing values."
      >
        <ButtonLink href={`/dashboard?location=${encodeURIComponent(slug)}`}>
          <Icon name="refresh" size={16} />
          Try again
        </ButtonLink>
      </ErrorState>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading air-quality data…</span>
      <Skeleton className="h-16 w-full rounded-card" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-card lg:col-span-2" />
        <Skeleton className="h-80 rounded-card" />
        <Skeleton className="h-56 rounded-card lg:col-span-2" />
        <Skeleton className="h-56 rounded-card" />
      </div>
    </div>
  );
}
