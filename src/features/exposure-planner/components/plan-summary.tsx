import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/states";
import { ProvenanceBadge } from "@/features/air-quality/components/provenance-badge";
import { CPCB_AQI_CATEGORIES } from "@/features/air-quality/cpcb-aqi-scale";
import type { AreaAirQuality } from "@/features/air-quality/services/area-air-quality";
import { cn } from "@/lib/utils/cn";
import { advisorHref } from "@/features/health-advisor/schemas/advisor-request";
import { formatAge, formatConcentration, formatDateTimeIst, formatTimeIst } from "@/lib/utils/format";

import { ACTIVITIES } from "../constants";
import { planRequestToSearchParams } from "../schemas/plan-request";
import type { PlanResult, PlanWindow } from "../services/plan";

import { PlanChart } from "./plan-chart";

const ug = (value: number) => `${formatConcentration(value)} µg/m³`;
const span = (window: PlanWindow) => `${formatTimeIst(window.start).replace(" IST", "")}–${formatTimeIst(window.end)}`;

function RelativeTag({ window }: { window: PlanWindow }) {
  if (window.relative === "lowest") return <Badge tone="success">Lowest</Badge>;
  if (window.relative === "similar") return <Badge tone="neutral">Similar to lowest</Badge>;
  return <Badge tone="warning">{window.aboveLowestPercent ?? 0}% higher</Badge>;
}

const EMPTY_COPY: Record<Exclude<PlanResult["status"], "ok">, { title: string; description: string }> = {
  no_forecast: {
    title: "No forecast stored for this area",
    description: "The planner only compares real forecast data. Nothing is shown rather than guessing.",
  },
  no_windows: {
    title: "No forecast hours left in this range",
    description: "The time range has passed or is beyond the stored forecast. Try a later range or tomorrow.",
  },
  range_too_short: {
    title: "The time range is shorter than the activity",
    description: "Choose an earlier start, a later finish or a shorter duration.",
  },
  insufficient_data: {
    title: "The forecast is missing values for this range",
    description: "Windows with missing PM2.5 values are not ranked. Try another range or day.",
  },
};

export function PlanSummary({ plan, current }: { plan: PlanResult; current: AreaAirQuality }) {
  if (plan.status !== "ok" || !plan.best) {
    const copy = EMPTY_COPY[plan.status === "ok" ? "insufficient_data" : plan.status];
    const tomorrow = { ...plan.request, day: "tomorrow" as const };
    return (
      <Card>
        <EmptyState headingLevel="h2" icon="calendar" title={copy.title} description={copy.description}>
          {plan.request.day === "today" && plan.status === "no_windows" ? (
            <ButtonLink variant="secondary" href={`/planner?${planRequestToSearchParams(tomorrow)}`}>
              Plan for tomorrow
            </ButtonLink>
          ) : null}
        </EmptyState>
      </Card>
    );
  }

  const { best, worst } = plan;
  const activity = ACTIVITIES[plan.request.activity];
  const ranked = plan.windows.filter((w) => w.rank !== null).length;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader
          title="Forecast comparison"
          description={`${activity.label} for ${plan.request.duration} min, ${plan.request.day}, ${ranked} start times compared`}
          action={
            <span className="flex flex-wrap items-center gap-1.5">
              {plan.forecast.isStale ? <Badge tone="warning">Stale forecast</Badge> : null}
              <ProvenanceBadge kind="forecast" />
              <ProvenanceBadge kind="modelled" />
            </span>
          }
        />
        <div className="flex flex-col gap-5 p-5">
          <div className="rounded-xl border border-line bg-canvas p-4">
            {plan.clearDifference && worst ? (
              <>
                <p className="text-xs font-medium tracking-wide text-ink-subtle uppercase">Comparatively preferable</p>
                <p className="mt-1 text-xl font-semibold text-ink">{span(best)}</p>
                <p className="mt-2 text-sm text-ink-muted">
                  Lowest forecast PM2.5 in your range: mean <strong className="text-ink">{ug(best.pm25Mean ?? 0)}</strong>,{" "}
                  {plan.bestBelowWorstPercent}% lower than the highest window ({formatTimeIst(worst.start)},{" "}
                  {ug(worst.pm25Mean ?? 0)}).
                </p>
                {plan.similarStarts.length > 0 ? (
                  <p className="mt-2 text-sm text-ink-muted">
                    Similar start times (not meaningfully higher):{" "}
                    {plan.similarStarts.map((start) => formatTimeIst(start).replace(" IST", "")).join(", ")}.
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <p className="text-xs font-medium tracking-wide text-ink-subtle uppercase">Little difference</p>
                <p className="mt-1 text-xl font-semibold text-ink">Timing makes little difference in this range</p>
                <p className="mt-2 text-sm text-ink-muted">
                  Forecast PM2.5 stays between {ug(best.pm25Mean ?? 0)} and {ug(worst?.pm25Mean ?? best.pm25Mean ?? 0)} (window
                  means). The lowest is {span(best)}, but the difference is too small to read much into a modelled forecast.
                </p>
              </>
            )}
          </div>

          {plan.periods.length > 1 ? (
            <div>
              <h3 className="text-sm font-semibold text-ink">By part of the day</h3>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {plan.periods.map((period) => (
                  <li key={period.id} className="flex flex-col gap-1 rounded-lg border border-line p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink">{period.label}</span>
                      {period.best ? <RelativeTag window={period.best} /> : <Badge tone="neutral">No data</Badge>}
                    </div>
                    {period.best ? (
                      <p className="text-sm text-ink-muted">
                        Best start {formatTimeIst(period.best.start)} · mean PM2.5{" "}
                        <span className="font-medium text-ink tabular-nums">{ug(period.best.pm25Mean ?? 0)}</span>
                      </p>
                    ) : (
                      <p className="text-sm text-ink-muted">Forecast values missing.</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <h3 className="text-sm font-semibold text-ink">Hourly forecast PM2.5</h3>
            <div className="mt-3">
              <PlanChart
                points={plan.points}
                rangeFrom={plan.request.from}
                rangeTo={plan.request.to}
                lowestStart={best.start}
                lowestHours={best.hoursUsed}
              />
            </div>
          </div>

          <div role="note" className="flex gap-3 rounded-lg border border-line p-3 text-xs text-ink-muted">
            <Icon name="info" size={16} className="mt-0.5 shrink-0 text-ink-subtle" />
            <p>
              &ldquo;Comparatively preferable&rdquo; is not the same as safe. These are modelled forecast values from{" "}
              {plan.forecast.provider}, which have read lower than Jaipur monitoring stations, so use them to compare times,
              not as actual levels.
              {plan.forecast.fetchedAt ? ` Forecast fetched ${formatDateTimeIst(plan.forecast.fetchedAt)}.` : ""}
              {plan.incompleteWindows > 0 ? ` ${plan.incompleteWindows} start times with missing values were not ranked.` : ""}
            </p>
          </div>
        </div>
      </Card>

      <CurrentContext current={current} plan={plan} />
    </div>
  );
}

function CurrentContext({ current, plan }: { current: AreaAirQuality; plan: PlanResult }) {
  const measured = current.measured;
  const aqi = measured?.aqi ?? null;
  const category = aqi?.category ? CPCB_AQI_CATEGORIES.find((c) => c.id === aqi.category) : null;
  const vigorous = ACTIVITIES[plan.request.activity].intensity === "vigorous";

  return (
    <Card>
      <CardHeader
        title="Right now"
        description={measured ? `${measured.station.name}, ${measured.station.distanceKm.toFixed(1)} km away` : current.location.name}
        action={measured ? <ProvenanceBadge kind="measured" /> : null}
      />
      <div className="flex flex-col gap-4 p-5 text-sm">
        {measured && aqi && category ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-3xl font-semibold text-ink tabular-nums">
                {aqi.value}
                {aqi.isLowerBound ? "+" : ""}
              </span>
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", category.chipClass)}>{category.label}</span>
            </div>
            <p className="text-xs text-ink-subtle">
              India AQI (CPCB), calculated by Hawa AI · observed {formatDateTimeIst(measured.observedAt)}
              {measured.isStale ? ` · ${formatAge(measured.ageMinutes)} old` : ""}
            </p>
            {measured.isStale ? <Badge tone="warning">Stale measurement</Badge> : null}
            <p className="text-ink-muted">{category.healthImpact}</p>
          </div>
        ) : (
          <p className="text-ink-muted">
            No current station AQI is available for this area. Check the dashboard before you go out.
          </p>
        )}

        <ul className="flex flex-col gap-2 border-t border-line pt-4 text-ink-muted">
          {vigorous ? (
            <li className="flex gap-2">
              <Icon name="wind" size={16} className="mt-0.5 shrink-0 text-ink-subtle" />
              Running, cycling and workouts make you breathe faster and deeper than walking, so you take in more air, and
              more pollution, per minute.
            </li>
          ) : null}
          {plan.request.sensitive ? (
            <li className="flex gap-2">
              <Icon name="shield" size={16} className="mt-0.5 shrink-0 text-ink-subtle" />
              For sensitive groups: consider a shorter or lighter session, follow your doctor&apos;s instructions, and stop
              if you feel breathless or unwell.
            </li>
          ) : null}
          <li className="flex gap-2">
            <Icon name="clock" size={16} className="mt-0.5 shrink-0 text-ink-subtle" />
            Check the latest measured values just before you start; forecasts can be wrong.
          </li>
        </ul>
        <ButtonLink
          href={advisorHref({
            location: plan.request.location,
            activity: plan.request.activity === "workout" ? "exercise" : plan.request.activity,
            profile: plan.request.sensitive ? "unspecified" : "general",
          })}
          variant="secondary"
          size="sm"
          className="self-start"
        >
          <Icon name="shield" size={14} />
          Health advice for this activity
        </ButtonLink>
      </div>
    </Card>
  );
}
