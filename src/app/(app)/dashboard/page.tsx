import type { Metadata } from "next";

import { PanelPlaceholder } from "@/components/layout/module-placeholder";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { formatCoordinates, siteConfig } from "@/config/site";
import { AqiScaleLegend } from "@/features/air-quality/components/aqi-scale-legend";
import {
  PROVENANCE_DETAILS,
  ProvenanceBadge,
} from "@/features/air-quality/components/provenance-badge";
import type { DataProvenance } from "@/features/air-quality/types/aqi";

export const metadata: Metadata = {
  title: "Air dashboard",
};

const PROVENANCE_KINDS: DataProvenance[] = ["measured", "modelled", "forecast"];

export default function DashboardPage() {
  const { centre } = siteConfig.pilotCity;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`${siteConfig.pilotCity.name} · Air dashboard`}
        title="Air dashboard"
        description="Current conditions, pollutants and forecasts for Jaipur. Every value will show its provider, AQI standard, observation time and whether it is measured, modelled or forecast."
        actions={<Badge tone="placeholder">Development placeholder</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Current AQI */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Current AQI"
            description={`City centre · ${formatCoordinates(centre.latitude, centre.longitude)}`}
            action={<Badge tone="neutral">No data</Badge>}
          />
          <EmptyState
            headingLevel="h3"
            icon="wind"
            title="No verified reading yet"
            description="The India National AQI (CPCB) will appear here once the Google Air Quality integration is connected and its Jaipur response has been verified."
          />
          <div className="border-t border-line p-5">
            <AqiScaleLegend />
          </div>
        </Card>

        {/* Source and freshness */}
        <Card>
          <CardHeader
            title="Source and freshness"
            description="Shown with every reading"
          />
          <dl className="flex flex-col gap-3 p-5 text-sm">
            {[
              ["Provider", "Not connected"],
              ["AQI standard", "India National AQI (CPCB) when available"],
              ["Observed at", "—"],
              ["Fetched at", "—"],
            ].map(([term, value]) => (
              <div key={term} className="flex justify-between gap-4">
                <dt className="shrink-0 text-ink-subtle">{term}</dt>
                <dd className="text-right font-medium text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="border-t border-line p-5">
            <p className="text-xs font-semibold tracking-wider text-ink-subtle uppercase">
              Provenance labels
            </p>
            <ul className="mt-3 flex flex-col gap-2.5">
              {PROVENANCE_KINDS.map((kind) => (
                <li key={kind} className="flex items-start gap-3">
                  <ProvenanceBadge kind={kind} />
                  <span className="text-xs leading-5 text-ink-subtle">
                    {PROVENANCE_DETAILS[kind].description}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <PanelPlaceholder
          title="Pollutants"
          icon="layers"
          description="PM2.5, PM10, NO₂, SO₂, CO and O₃ with units, where the provider returns them. Missing pollutants will be shown as unavailable, never estimated."
        />
        <PanelPlaceholder
          title="Hourly trend"
          icon="chart"
          description="Recent hourly history from the provider, kept on a single AQI standard."
        />
        <PanelPlaceholder
          title="Four-day forecast"
          icon="calendar"
          description="Provider forecast, always labelled as a forecast and never shown as an observation."
        />
        <PanelPlaceholder
          className="lg:col-span-2"
          title="Neighbourhood map"
          icon="map"
          description="Jaipur areas on a map. Modelled area estimates will be labelled separately from monitoring-station measurements."
        />
        <PanelPlaceholder
          title="AI daily summary"
          icon="sparkle"
          description="A plain-language summary generated only from retrieved data, with sources and timestamps."
        />
      </div>
    </div>
  );
}
