import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/states";
import { formatConcentration, formatTimeIst } from "@/lib/utils/format";

import type { AreaAirQuality } from "../../services/area-air-quality";
import { POLLUTANT_LABELS, UNIT_LABELS, type PollutantCode } from "../../types/aqi";
import { ProvenanceBadge } from "../provenance-badge";

const SHOWN: PollutantCode[] = ["pm25", "pm10", "no2", "o3"];

/**
 * Secondary panel: the model estimate for the selected area. Shown with a
 * live comparison against the station so its bias is visible, not hidden.
 */
export function ModelledCard({
  current,
  className,
}: {
  current: AreaAirQuality;
  className?: string;
}) {
  const { modelled, measured } = current;
  const modelPm25 = modelled?.pollutants.find((p) => p.pollutant === "pm25");
  const stationPm25 = measured?.pollutants.find((p) => p.pollutant === "pm25" && p.unit === "ug_m3");
  const ratio =
    modelPm25 && stationPm25 && modelPm25.value > 0 ? stationPm25.value / modelPm25.value : null;

  return (
    <Card className={className}>
      <CardHeader
        title="Model estimate"
        description={`Open-Meteo, for ${current.location.name}`}
        action={modelled ? <ProvenanceBadge kind="modelled" /> : null}
      />
      {!modelled ? (
        <EmptyState compact headingLevel="h3" icon="layers" title="No model estimate stored" />
      ) : (
        <div className="flex flex-col gap-4 p-5">
          <ul className="grid grid-cols-2 gap-3">
            {SHOWN.map((code) => {
              const reading = modelled.pollutants.find((p) => p.pollutant === code);
              return (
                <li key={code}>
                  <p className="text-xs font-semibold text-ink-subtle">{POLLUTANT_LABELS[code]}</p>
                  <p className="mt-0.5 text-lg font-semibold text-ink">
                    {reading ? formatConcentration(reading.value) : "—"}
                    {reading ? (
                      <span className="ml-1 text-xs font-normal text-ink-subtle">{UNIT_LABELS[reading.unit]}</span>
                    ) : null}
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-ink-subtle">Model hour: {formatTimeIst(modelled.observedAt)}</p>
          <div className="flex gap-2 rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-xs leading-5 text-yellow-900">
            <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
            <p>
              {ratio !== null && ratio >= 1.5
                ? `The station is reading ${ratio.toFixed(1)}× the model's PM2.5 right now. `
                : ""}
              This model has read far below Jaipur&apos;s monitoring stations and covers about a 10 km
              grid cell, so nearby areas share one estimate. Use it for trends, not as the
              area&apos;s air quality.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
