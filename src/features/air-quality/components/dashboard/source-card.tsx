import { Card, CardHeader } from "@/components/ui/card";
import { formatDateTimeIst } from "@/lib/utils/format";

import type { AreaAirQuality } from "../../services/area-air-quality";
import { PROVENANCE_DETAILS, ProvenanceBadge } from "../provenance-badge";

export function SourceCard({ current, className }: { current: AreaAirQuality; className?: string }) {
  const { measured, modelled } = current;

  const rows: [string, string][] = [
    [
      "Station data",
      measured
        ? `OpenAQ · ${[measured.station.network, measured.station.operator].filter(Boolean).join(" / ") || "network not stated"}`
        : "Not available",
    ],
    ["AQI standard", "India National AQI (CPCB), calculated by Hawa AI"],
    ["Measured hour ending", measured ? formatDateTimeIst(measured.observedAt) : "—"],
    ["Station data fetched", measured ? formatDateTimeIst(measured.fetchedAt) : "—"],
    ["Model data", modelled ? "Open-Meteo Air Quality API" : "Not available"],
    ["Model estimate for", modelled ? formatDateTimeIst(modelled.observedAt) : "—"],
  ];

  return (
    <Card className={className}>
      <CardHeader title="Sources and freshness" description="Shown with every value" />
      <dl className="flex flex-col gap-2.5 p-5 text-sm">
        {rows.map(([term, value]) => (
          <div key={term} className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
            <dt className="shrink-0 text-ink-subtle">{term}</dt>
            <dd className="font-medium text-ink sm:text-right">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-line p-5">
        <p className="text-xs font-semibold tracking-wider text-ink-subtle uppercase">Labels</p>
        <ul className="mt-3 flex flex-col gap-2.5">
          {(["measured", "modelled", "forecast"] as const).map((kind) => (
            <li key={kind} className="flex items-start gap-3">
              <ProvenanceBadge kind={kind} />
              <span className="text-xs leading-5 text-ink-subtle">{PROVENANCE_DETAILS[kind].description}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
