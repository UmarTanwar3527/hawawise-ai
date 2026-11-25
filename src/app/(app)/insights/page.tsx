import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ExplanationCard } from "@/features/ai-guardian/components/explanation-card";
import { ProvenanceBadge } from "@/features/air-quality/components/provenance-badge";
import { CPCB_AQI_CATEGORIES } from "@/features/air-quality/cpcb-aqi-scale";
import { DailyTrendChart } from "@/features/city-insights/components/daily-trend-chart";
import { HourOfDayChart } from "@/features/city-insights/components/hour-of-day-chart";
import { dayLabel, hourRangeLabel } from "@/features/city-insights/format";
import type { CityInsights, StationStats } from "@/features/city-insights/services/compute";
import { loadCityInsights } from "@/features/city-insights/services/data";
import { categoryLabel } from "@/features/civic-reports/constants";
import { isGeminiConfigured } from "@/lib/gemini/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cn } from "@/lib/utils/cn";
import { formatConcentration, formatDateTimeIst } from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "City insights",
};

export default function InsightsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Jaipur · Last 7 days"
        title="City insights"
        description="Trends, station comparisons and daily patterns calculated from stored station measurements. AI only interprets the results."
      />
      <Suspense fallback={<InsightsSkeleton />}>
        <InsightsContent />
      </Suspense>
    </div>
  );
}

const ug = (value: number) => `${formatConcentration(value)} µg/m³`;
const categoryOf = (id: string | null) => CPCB_AQI_CATEGORIES.find((c) => c.id === id) ?? null;

function signed(percent: number | null, unit = "%") {
  if (percent === null) return null;
  return `${percent > 0 ? "+" : ""}${percent}${unit}`;
}

async function InsightsContent() {
  if (!isSupabaseConfigured()) {
    return (
      <Card>
        <ErrorState title="Air-quality storage is not configured" />
      </Card>
    );
  }
  await connection();
  const now = new Date();
  let result: Awaited<ReturnType<typeof loadCityInsights>>;
  try {
    result = await loadCityInsights(now);
  } catch (error) {
    console.error("insights failed", error instanceof Error ? error.name : "unknown");
    return (
      <Card>
        <ErrorState
          title="Insights are temporarily unavailable"
          description="Stored measurements could not be loaded. Nothing is shown rather than guessing values."
        />
      </Card>
    );
  }
  const { insights, forecastUnavailable, reportsUnavailable } = result;
  if (insights.daily.every((d) => d.pm25 === null)) {
    return (
      <Card>
        <EmptyState icon="chart" title="Not enough history yet" description="Insights need at least one full day of station measurements." />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-ink-muted">
        Period: {dayLabel(insights.period.days[0] as string)} to {dayLabel(insights.period.days.at(-1) as string)} (complete days, IST).{" "}
        {insights.stationCount} monitoring stations. Data coverage {insights.coverage.percent}%.
      </p>

      <SummaryTiles insights={insights} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Daily city levels"
            description="Mean of station daily means; a station-day counts with 18+ hourly values"
            action={<ProvenanceBadge kind="measured" />}
          />
          <div className="p-5">
            <DailyTrendChart daily={insights.daily} />
          </div>
        </Card>
        <CategoryHours insights={insights} />

        <Card className="lg:col-span-2">
          <CardHeader
            title="Daily rhythm"
            description={
              insights.hourOfDay.peak && insights.hourOfDay.lowest
                ? `PM2.5 peaks around ${hourRangeLabel(insights.hourOfDay.peak.hour)} (${ug(insights.hourOfDay.peak.pm25)}) and is lowest around ${hourRangeLabel(insights.hourOfDay.lowest.hour)} (${ug(insights.hourOfDay.lowest.pm25)}), on average.`
                : "Mean PM2.5 by hour of day"
            }
            action={<ProvenanceBadge kind="measured" />}
          />
          <div className="p-5">
            <HourOfDayChart hours={insights.hourOfDay.hours} peak={insights.hourOfDay.peak?.hour ?? null} lowest={insights.hourOfDay.lowest?.hour ?? null} />
          </div>
        </Card>
        <div className="flex flex-col gap-6">
          <ForecastOutlook insights={insights} unavailable={forecastUnavailable} />
          <ReportsSummary insights={insights} unavailable={reportsUnavailable} />
        </div>

        <StationTable stations={insights.stations} className="lg:col-span-3" />
      </div>

      <ExplanationCard
        endpoint="/api/insights/explain"
        payload={{}}
        enabled={isGeminiConfigured()}
        title="AI interpretation"
        description="Gemini interprets the statistics above: what is happening, where, when and what to do. It cannot change the figures, and every figure is checked against the data."
        basis="The statistics above do not depend on AI."
      />

      <details className="rounded-card border border-line bg-surface p-5 text-sm text-ink-muted shadow-card">
        <summary className="cursor-pointer font-semibold text-ink">How these insights are calculated</summary>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5">
          <li>Source: hourly station measurements from CPCB/RSPCB monitors via OpenAQ, stored by Hawa AI. AQI is India&apos;s National AQI calculated by Hawa AI (CPCB method), not an official bulletin.</li>
          <li>Daily levels: each station&apos;s daily mean (only with 18 or more hourly values), then the mean across stations. Today is excluded because it is incomplete.</li>
          <li>Station means need at least half of the period&apos;s hours; otherwise they show as unavailable.</li>
          <li>Current ranking uses only stations with a calculated AQI from the last 4 hours.</li>
          <li>Daily rhythm: mean PM2.5 for each hour of day (IST, hour start) across all stations and days; hours with fewer than 10 values are hidden.</li>
          <li>Forecast: modelled Open-Meteo values for the city centre, which have read lower than stations; only the direction is used.</li>
          <li>Community reports are unverified submissions.</li>
        </ul>
      </details>
    </div>
  );
}

function Tile({ label, children, note }: { label: string; children: ReactNode; note?: ReactNode }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <p className="text-xs font-medium tracking-wide text-ink-subtle uppercase">{label}</p>
      {children}
      {note ? <p className="text-xs text-ink-subtle">{note}</p> : null}
    </Card>
  );
}

function StationNow({ station }: { station: StationStats | null }) {
  if (!station?.latest) return <p className="text-sm text-ink-muted">Not enough current data</p>;
  const category = categoryOf(station.latest.category);
  return (
    <>
      <p className="flex flex-wrap items-baseline gap-2">
        <span className="text-2xl font-semibold text-ink tabular-nums">
          {station.latest.aqi}
          {station.latest.isLowerBound ? "+" : ""}
        </span>
        {category ? <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", category.chipClass)}>{category.label}</span> : null}
      </p>
      <p className="text-sm font-medium text-ink">{station.name.replace(/, Jaipur - RSPCB$/, "")}</p>
    </>
  );
}

function SummaryTiles({ insights }: { insights: CityInsights }) {
  const { ranking, change, coverage } = insights;
  const latestDay = [...insights.daily].reverse().find((d) => d.pm25 !== null);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Tile
        label="Highest station now"
        note={ranking.mostPolluted?.latest ? `Calculated AQI · ${formatDateTimeIst(ranking.mostPolluted.latest.observedAt)}` : ranking.note}
      >
        <StationNow station={ranking.mostPolluted} />
      </Tile>
      <Tile
        label="Lowest station now"
        note={ranking.cleanest?.latest ? `Calculated AQI · ${ranking.freshStations} stations current` : ranking.note}
      >
        <StationNow station={ranking.cleanest} />
      </Tile>
      <Tile
        label="City PM2.5, latest full day"
        note={
          latestDay
            ? [
                change.pm25DayOverDayPercent !== null ? `${signed(change.pm25DayOverDayPercent)} vs previous day` : null,
                change.periodPm25Mean !== null ? `7-day mean ${ug(change.periodPm25Mean)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : null
        }
      >
        <p className="text-2xl font-semibold text-ink tabular-nums">{latestDay?.pm25 != null ? ug(latestDay.pm25) : "—"}</p>
        <p className="text-sm text-ink-muted">{latestDay ? dayLabel(latestDay.day) : ""}</p>
      </Tile>
      <Tile label="Data coverage" note={`${coverage.hoursWithData.toLocaleString("en-IN")} of ${coverage.hoursExpected.toLocaleString("en-IN")} station-hours`}>
        <p className="text-2xl font-semibold text-ink tabular-nums">{coverage.percent}%</p>
        <p className="text-sm text-ink-muted">{insights.stationCount} stations, 7 days</p>
      </Tile>
    </div>
  );
}

function CategoryHours({ insights }: { insights: CityInsights }) {
  const total = insights.categoryHours.reduce((s, c) => s + c.hours, 0);
  return (
    <Card>
      <CardHeader title="Hours in each AQI category" description="Station-hours by calculated CPCB category" />
      <div className="flex flex-col gap-4 p-5">
        {total ? (
          <>
            <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
              {insights.categoryHours
                .filter((c) => c.hours > 0)
                .map((c) => (
                  <span key={c.category} className={cn("h-full", categoryOf(c.category)?.swatchClass)} style={{ width: `${(c.hours / total) * 100}%` }} />
                ))}
            </div>
            <ul className="flex flex-col gap-1.5 text-sm">
              {insights.categoryHours.map((c) => (
                <li key={c.category} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-ink">
                    <span aria-hidden="true" className={cn("size-3 rounded-[3px]", categoryOf(c.category)?.swatchClass)} />
                    {c.label}
                  </span>
                  <span className="text-ink-muted tabular-nums">
                    {c.hours} h · {Math.round((c.hours / total) * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-ink-muted">No calculated AQI values in this period.</p>
        )}
      </div>
    </Card>
  );
}

function ForecastOutlook({ insights, unavailable }: { insights: CityInsights; unavailable: boolean }) {
  const forecast = insights.forecast;
  return (
    <Card>
      <CardHeader
        title="Forecast direction"
        description="City centre, full forecast days"
        action={
          <span className="flex gap-1.5">
            <ProvenanceBadge kind="forecast" />
            <ProvenanceBadge kind="modelled" />
          </span>
        }
      />
      <div className="flex flex-col gap-3 p-5 text-sm">
        {forecast && forecast.days.length ? (
          <>
            {forecast.changePercent !== null ? (
              <p className="text-ink">
                Modelled PM2.5 is{" "}
                <strong>
                  {Math.abs(forecast.changePercent)}% {forecast.changePercent >= 0 ? "higher" : "lower"}
                </strong>{" "}
                on {dayLabel(forecast.days.at(-1)?.day as string)} than on {dayLabel(forecast.days[0]?.day as string)}.
              </p>
            ) : null}
            <ul className="flex flex-col gap-1 text-ink-muted">
              {forecast.days.map((d) => (
                <li key={d.day} className="flex justify-between">
                  <span>{dayLabel(d.day)}</span>
                  <span className="tabular-nums">~{ug(d.pm25Mean)}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-ink-subtle">The model reads lower than stations; use the direction, not the levels.</p>
          </>
        ) : (
          <p className="text-ink-muted">{unavailable ? "The forecast could not be loaded." : "No full forecast days stored."}</p>
        )}
      </div>
    </Card>
  );
}

function ReportsSummary({ insights, unavailable }: { insights: CityInsights; unavailable: boolean }) {
  const { reports } = insights;
  return (
    <Card>
      <CardHeader title="Community reports" description="Last 30 days, unverified" action={<Badge tone="neutral">{reports.last30Days}</Badge>} />
      <div className="flex flex-col gap-3 p-5 text-sm">
        {unavailable ? (
          <p className="text-ink-muted">Reports could not be loaded.</p>
        ) : reports.byCategory.length ? (
          <ul className="flex flex-col gap-1.5">
            {reports.byCategory.map((r) => (
              <li key={r.category} className="flex justify-between gap-3 text-ink">
                <span>{categoryLabel(r.category)}</span>
                <span className="text-ink-muted tabular-nums">{r.count}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-muted">No reports in the last 30 days.</p>
        )}
        <ButtonLink href="/reports/new" variant="secondary" size="sm" className="self-start">
          <Icon name="flag" size={14} />
          Report pollution
        </ButtonLink>
      </div>
    </Card>
  );
}

function StationTable({ stations, className }: { stations: StationStats[]; className?: string }) {
  const max = Math.max(1, ...stations.map((s) => s.pm25Mean ?? 0));
  return (
    <Card className={className}>
      <CardHeader title="Station comparison" description="7-day means from measurements, highest PM2.5 first" action={<ProvenanceBadge kind="measured" />} />
      <div className="overflow-x-auto p-5 pt-3">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="text-xs text-ink-subtle">
            <tr>
              <th scope="col" className="py-2 pr-3 font-medium">Station</th>
              <th scope="col" className="py-2 pr-3 font-medium">Mean PM2.5 (µg/m³)</th>
              <th scope="col" className="py-2 pr-3 font-medium">Mean PM10</th>
              <th scope="col" className="py-2 pr-3 font-medium">Mean AQI</th>
              <th scope="col" className="py-2 pr-3 font-medium">Highest AQI</th>
              <th scope="col" className="py-2 pr-3 font-medium">Coverage</th>
              <th scope="col" className="py-2 font-medium">Latest</th>
            </tr>
          </thead>
          <tbody>
            {stations.map((s) => {
              const meanCategory = s.aqiMean !== null ? CPCB_AQI_CATEGORIES.find((c) => (s.aqiMean as number) <= c.max) : null;
              return (
                <tr key={s.id} className="border-t border-line align-middle">
                  <th scope="row" className="py-2.5 pr-3 font-medium text-ink">{s.name.replace(/, Jaipur - RSPCB$/, "")}</th>
                  <td className="py-2.5 pr-3">
                    {s.pm25Mean !== null ? (
                      <span className="flex items-center gap-2">
                        <span className="w-10 text-ink tabular-nums">{formatConcentration(s.pm25Mean)}</span>
                        <span aria-hidden="true" className="h-2 rounded-full bg-series-1" style={{ width: `${(s.pm25Mean / max) * 6}rem` }} />
                      </span>
                    ) : (
                      <span className="text-ink-subtle">Too few values</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-ink tabular-nums">{s.pm10Mean !== null ? formatConcentration(s.pm10Mean) : "—"}</td>
                  <td className="py-2.5 pr-3 text-ink tabular-nums">
                    {s.aqiMean ?? "—"}
                    {meanCategory ? <span className="ml-1.5 text-xs text-ink-subtle">{meanCategory.label}</span> : null}
                  </td>
                  <td className="py-2.5 pr-3 text-ink tabular-nums">{s.aqiMax ?? "—"}</td>
                  <td className="py-2.5 pr-3 tabular-nums">
                    <span className={s.coveragePercent < 75 ? "text-yellow-800" : "text-ink-muted"}>{s.coveragePercent}%</span>
                  </td>
                  <td className="py-2.5 text-ink-muted">
                    {s.latest ? (
                      <span className="flex items-center gap-1.5">
                        {s.latest.aqi}
                        {s.latest.isStale ? <Badge tone="warning">Stale</Badge> : null}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function InsightsSkeleton() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading insights…</span>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-card" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-card lg:col-span-2" />
        <Skeleton className="h-80 rounded-card" />
      </div>
    </div>
  );
}
