import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { formatConcentration, formatTimeIst } from "@/lib/utils/format";

import type { PollutantReading } from "../../services/area-air-quality";
import { POLLUTANT_LABELS, UNIT_LABELS, type PollutantCode } from "../../types/aqi";
import { ProvenanceBadge } from "../provenance-badge";

/** Pollutants always shown, so a missing one is visible rather than absent. */
const SHOWN: PollutantCode[] = ["pm25", "pm10", "no2", "so2", "co", "o3"];

export function PollutantGrid({
  pollutants,
  stationName,
  observedAt,
  className,
}: {
  pollutants: PollutantReading[] | null;
  stationName: string | null;
  observedAt: string | null;
  className?: string;
}) {
  const byCode = new Map((pollutants ?? []).map((p) => [p.pollutant, p]));

  return (
    <Card className={className}>
      <CardHeader
        title="Pollutants"
        description={
          stationName && observedAt
            ? `1-hour averages at ${stationName}, hour ending ${formatTimeIst(observedAt)}`
            : "No station measurements available"
        }
        action={pollutants ? <ProvenanceBadge kind="measured" /> : null}
      />
      <ul className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3">
        {SHOWN.map((code) => {
          const reading = byCode.get(code);
          const nonMass = reading && (reading.unit === "ppb" || reading.unit === "ppm");
          return (
            <li key={code} className="rounded-xl border border-line p-3.5">
              <p className="text-xs font-semibold text-ink-subtle">{POLLUTANT_LABELS[code]}</p>
              {reading && nonMass ? (
                <p className="mt-1.5 flex gap-1 text-xs leading-4 text-yellow-800">
                  <Icon name="alert" size={12} className="mt-0.5 shrink-0" />
                  Value not shown: OpenAQ reports it in {UNIT_LABELS[reading.unit]}, which is under
                  verification
                </p>
              ) : reading ? (
                <>
                  <p className="mt-1.5 flex items-baseline gap-1">
                    <span className="text-2xl font-semibold tracking-tight text-ink">
                      {formatConcentration(reading.value)}
                    </span>
                    <span className="text-xs text-ink-subtle">{UNIT_LABELS[reading.unit]}</span>
                  </p>
                  {reading.coveragePercent !== null ? (
                    <p className="mt-1.5 text-[11px] text-ink-subtle">
                      {Math.round(reading.coveragePercent)}% of samples in hour
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="mt-1.5 text-sm text-ink-subtle">Not reported</p>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
