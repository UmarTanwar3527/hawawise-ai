import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/utils/cn";
import { formatConcentration, formatDateTimeIst, formatWeekdayIst, istDayKey } from "@/lib/utils/format";

import type { AreaForecast } from "../../services/area-air-quality";
import { ProvenanceBadge } from "../provenance-badge";

type DaySummary = { key: string; iso: string; hours: number; pm25: number | null; pm10: number | null };

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

/** Groups hourly forecast values into IST calendar days (first four). */
export function summariseByDay(forecast: AreaForecast): DaySummary[] {
  const days = new Map<string, { iso: string; pm25: number[]; pm10: number[]; hours: number }>();
  for (const hour of forecast.hours) {
    const key = istDayKey(hour.forecastFor);
    const day = days.get(key) ?? { iso: hour.forecastFor, pm25: [], pm10: [], hours: 0 };
    day.hours += 1;
    for (const p of hour.pollutants) {
      if (p.unit !== "ug_m3") continue;
      if (p.pollutant === "pm25") day.pm25.push(p.value);
      if (p.pollutant === "pm10") day.pm10.push(p.value);
    }
    days.set(key, day);
  }
  return [...days.entries()].slice(0, 4).map(([key, day]) => ({
    key,
    iso: day.iso,
    hours: day.hours,
    pm25: mean(day.pm25),
    pm10: mean(day.pm10),
  }));
}

export function ForecastDays({
  forecast,
  generatedAt,
  className,
}: {
  forecast: AreaForecast;
  generatedAt: string;
  className?: string;
}) {
  const days = summariseByDay(forecast);
  const baseline = days[0]?.pm25 ?? null;
  const todayKey = istDayKey(generatedAt);

  return (
    <Card className={className}>
      <CardHeader
        title="Four-day outlook"
        description={
          forecast.issuedAt
            ? `Open-Meteo model run stored ${formatDateTimeIst(forecast.issuedAt)}`
            : "Open-Meteo model"
        }
        action={days.length ? <ProvenanceBadge kind="forecast" /> : null}
      />
      {days.length === 0 ? (
        <EmptyState
          compact
          headingLevel="h3"
          icon="calendar"
          title="No forecast available"
          description={forecast.unavailable[0] ?? "The forecast has not been ingested yet."}
        />
      ) : (
        <div className="flex flex-col gap-4 p-5">
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {days.map((day, index) => {
              const change =
                index > 0 && baseline && day.pm25 !== null ? ((day.pm25 - baseline) / baseline) * 100 : null;
              const direction = change === null || Math.abs(change) < 10 ? "flat" : change > 0 ? "up" : "down";
              return (
                <li key={day.key} className="rounded-xl border border-line p-3.5">
                  <p className="text-xs font-semibold text-ink">
                    {day.key === todayKey ? "Today" : formatWeekdayIst(day.iso)}
                  </p>
                  <p className="mt-2 text-xs text-ink-subtle">PM2.5 (modelled)</p>
                  <p className="text-xl font-semibold text-ink">
                    {day.pm25 !== null ? formatConcentration(day.pm25) : "—"}
                    <span className="ml-1 text-xs font-normal text-ink-subtle">µg/m³</span>
                  </p>
                  <p
                    className={cn(
                      "mt-1.5 flex items-center gap-1 text-xs",
                      direction === "up" ? "text-orange-800" : direction === "down" ? "text-green-800" : "text-ink-subtle",
                    )}
                  >
                    {index === 0 ? (
                      "Baseline"
                    ) : direction === "flat" ? (
                      "Similar to today"
                    ) : (
                      <>
                        <Icon name="chart" size={12} className={direction === "down" ? "-scale-y-100" : ""} />
                        {Math.round(Math.abs(change ?? 0))}% {direction === "up" ? "higher" : "lower"} than today
                      </>
                    )}
                  </p>
                  {day.hours < 20 ? (
                    <p className="mt-1 text-[11px] text-ink-subtle">Based on {day.hours} hours</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="flex gap-2 text-xs leading-5 text-ink-subtle">
            <Icon name="info" size={14} className="mt-0.5 shrink-0" />
            Model forecasts for Jaipur have read well below station measurements, so compare days
            with each other rather than reading the values as expected AQI. No AQI is calculated
            from forecasts.
          </p>
        </div>
      )}
    </Card>
  );
}
