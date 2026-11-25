import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/utils/cn";
import { formatAge, formatConcentration, formatTimeIst } from "@/lib/utils/format";

import { NEAREST_STATION_MAX_KM } from "../../constants";
import { calculationDetailsSchema } from "../../cpcb-aqi-calculator";
import { CPCB_AQI_CATEGORIES } from "../../cpcb-aqi-scale";
import type { AreaAirQuality } from "../../services/area-air-quality";
import { POLLUTANT_LABELS, UNIT_LABELS, type PollutantCode } from "../../types/aqi";
import { ProvenanceBadge } from "../provenance-badge";

const EXCLUSION_REASONS: Record<string, string> = {
  unit_not_supported: "reported in ppb/ppm; not converted",
  insufficient_hours: "not enough hours of data",
  no_data: "not reported by this station",
};

export function CurrentAqiCard({
  measured,
  areaName,
  className,
}: {
  measured: AreaAirQuality["measured"];
  areaName: string;
  className?: string;
}) {
  const aqi = measured?.aqi ?? null;
  const category = aqi ? CPCB_AQI_CATEGORIES.find((c) => c.id === aqi.category) ?? null : null;

  return (
    <Card className={className}>
      <CardHeader
        title="Current AQI"
        description="India National AQI (CPCB) from the nearest monitoring station"
        action={measured ? <ProvenanceBadge kind="measured" /> : <Badge tone="neutral">No data</Badge>}
      />

      {!measured || !aqi || !category ? (
        <EmptyState
          headingLevel="h3"
          icon="wind"
          title={measured ? "AQI not available for the latest hour" : "No station measurement available"}
          description={
            measured
              ? "The nearest station did not report enough pollutants or hours of data to calculate the CPCB AQI. Its pollutant readings are shown below."
              : `No monitoring station with data from the last 48 hours is within ${NEAREST_STATION_MAX_KM} km of ${areaName}.`
          }
        />
      ) : (
        <div className="flex flex-col gap-5 p-5">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <p className="flex items-baseline gap-1">
              <span className="text-6xl leading-none font-semibold tracking-tight text-ink">
                {aqi.value}
              </span>
              {aqi.isLowerBound ? (
                <>
                  <span aria-hidden="true" className="text-3xl font-semibold text-ink">
                    +
                  </span>
                  <span className="sr-only">or higher</span>
                </>
              ) : null}
            </p>
            <div className="flex flex-col gap-1.5 pb-1">
              <span
                className={cn(
                  "inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold",
                  category.chipClass,
                )}
              >
                <span aria-hidden="true" className={cn("size-2 rounded-full", category.swatchClass)} />
                {category.label}
              </span>
              {aqi.dominantPollutant ? (
                <span className="text-sm text-ink-muted">
                  Dominant pollutant:{" "}
                  <strong className="font-semibold text-ink">
                    {POLLUTANT_LABELS[aqi.dominantPollutant as PollutantCode] ?? aqi.dominantPollutant}
                  </strong>
                </span>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-line bg-canvas p-4">
            <p className="text-sm font-medium text-ink">{category.healthImpact}</p>
            <p className="mt-1 text-xs text-ink-subtle">
              CPCB health impact statement for this category. General information, not medical advice.
            </p>
          </div>

          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-subtle">Station</dt>
              <dd className="font-medium text-ink">
                {measured.station.name}{" "}
                <span className="font-normal text-ink-subtle">
                  · {measured.station.distanceKm} km from {areaName}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-ink-subtle">Data up to</dt>
              <dd className="flex flex-wrap items-center gap-2 font-medium text-ink">
                {formatTimeIst(measured.observedAt)}
                <span className="font-normal text-ink-subtle">({formatAge(measured.ageMinutes)} ago)</span>
                {measured.isStale ? (
                  <Badge tone="warning">
                    <Icon name="alert" size={12} />
                    Stale
                  </Badge>
                ) : null}
              </dd>
            </div>
          </dl>

          <p className="flex gap-2 text-xs leading-5 text-ink-subtle">
            <Icon name="info" size={14} className="mt-0.5 shrink-0" />
            Calculated by Hawa AI from station measurements using the CPCB method. This is not an
            official CPCB bulletin value.
          </p>

          <CalculationDetails details={aqi.calculationDetails} />
        </div>
      )}
    </Card>
  );
}

function CalculationDetails({ details }: { details: unknown }) {
  const parsed = calculationDetailsSchema.safeParse(details);
  if (!parsed.success || parsed.data.subIndices.length === 0) return null;
  const { subIndices, excluded } = parsed.data;
  return (
    <details className="group rounded-xl border border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-ink">
        How this AQI was calculated
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 text-ink-subtle transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="border-t border-line px-4 py-3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] text-left text-sm">
            <caption className="sr-only">CPCB sub-indices used for the AQI</caption>
            <thead className="text-xs text-ink-subtle">
              <tr>
                <th scope="col" className="py-1.5 pr-3 font-medium">Pollutant</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">Average</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">Hours</th>
                <th scope="col" className="py-1.5 font-medium">Sub-index</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {subIndices.map((entry) => (
                <tr key={entry.pollutant} className="border-t border-line">
                  <th scope="row" className="py-1.5 pr-3 font-medium text-ink">
                    {POLLUTANT_LABELS[entry.pollutant]}
                  </th>
                  <td className="py-1.5 pr-3 text-ink-muted">
                    {formatConcentration(entry.average)} {UNIT_LABELS[entry.unit]} ({entry.averagingHours} h)
                  </td>
                  <td className="py-1.5 pr-3 text-ink-muted">
                    {entry.hoursUsed}/{entry.averagingHours}
                  </td>
                  <td className="py-1.5 font-medium text-ink">
                    {entry.subIndex}
                    {entry.isLowerBound ? "+" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {excluded.length > 0 ? (
          <p className="mt-3 text-xs leading-5 text-ink-subtle">
            Not used:{" "}
            {excluded
              .map((entry) => `${POLLUTANT_LABELS[entry.pollutant] ?? entry.pollutant} (${EXCLUSION_REASONS[entry.reason] ?? entry.reason})`)
              .join("; ")}
            .
          </p>
        ) : null}
        <p className="mt-2 text-xs leading-5 text-ink-subtle">
          The AQI is the highest sub-index. CPCB requires at least three pollutants, including PM2.5
          or PM10. Averages use 24 hours (8 hours for CO and O₃).
        </p>
      </div>
    </details>
  );
}
