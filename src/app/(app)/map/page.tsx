import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { PollutionMap } from "@/features/air-quality/components/map/pollution-map";
import { getMapData, type MapData } from "@/features/air-quality/services/dashboard-data";
import type { PublicReport } from "@/features/civic-reports/schemas";
import { getPublicReports } from "@/features/civic-reports/services/reports";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Pollution map",
};

export default function MapPage({ searchParams }: PageProps<"/map">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Spatial intelligence"
        title="Pollution map"
        description="Monitoring stations across Jaipur with their latest calculated AQI, model estimates for each area, and community pollution reports."
      />
      <div role="note" className="flex gap-3 rounded-xl border border-blue-200 bg-primary-soft p-4 text-sm leading-6 text-primary-strong">
        <Icon name="info" size={18} className="mt-0.5 shrink-0" />
        Coloured squares are physical monitoring stations. Areas such as Vaishali Nagar or C-Scheme are interface
        locations, not stations; their values come from a model and are labelled as estimates.
      </div>
      <Suspense fallback={<Skeleton className="h-[540px] w-full rounded-card" />}>
        <MapContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function MapContent({ searchParams }: { searchParams: PageProps<"/map">["searchParams"] }) {
  const { report } = await searchParams;
  const initialReportId = typeof report === "string" && UUID.test(report) ? report : null;
  if (!isSupabaseConfigured()) {
    return (
      <Card>
        <ErrorState title="Air-quality storage is not configured" />
      </Card>
    );
  }
  let data: MapData;
  try {
    data = await getMapData();
  } catch (error) {
    console.error("map data failed", error instanceof Error ? error.name : "unknown");
    return (
      <Card>
        <ErrorState
          title="Map data is temporarily unavailable"
          description="Stored measurements could not be loaded. Nothing is shown rather than guessing values."
        />
      </Card>
    );
  }
  // Reports are optional: the map still renders measured data without them.
  let reports: PublicReport[] = [];
  let reportsUnavailable = false;
  try {
    reports = await getPublicReports();
  } catch (error) {
    reportsUnavailable = true;
    console.error("map reports failed", error instanceof Error ? error.name : "unknown");
  }
  if (data.stations.length === 0 && data.areas.length === 0) {
    return (
      <Card>
        <EmptyState icon="map" title="No stations or areas stored yet" />
      </Card>
    );
  }
  await connection();
  return (
    <PollutionMap
      stations={data.stations}
      areas={data.areas}
      reports={reports}
      reportsUnavailable={reportsUnavailable}
      initialReportId={initialReportId}
      generatedAt={new Date().toISOString()}
    />
  );
}
