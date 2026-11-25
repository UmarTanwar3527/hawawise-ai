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
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Pollution map",
};

export default function MapPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Spatial intelligence"
        title="Pollution map"
        description="Monitoring stations across Jaipur with their latest calculated AQI, and model estimates for each area."
      />
      <div role="note" className="flex gap-3 rounded-xl border border-blue-200 bg-primary-soft p-4 text-sm leading-6 text-primary-strong">
        <Icon name="info" size={18} className="mt-0.5 shrink-0" />
        Coloured squares are physical monitoring stations. Areas such as Vaishali Nagar or C-Scheme are interface
        locations, not stations; their values come from a model and are labelled as estimates.
      </div>
      <Suspense fallback={<Skeleton className="h-[540px] w-full rounded-card" />}>
        <MapContent />
      </Suspense>
    </div>
  );
}

async function MapContent() {
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
  if (data.stations.length === 0 && data.areas.length === 0) {
    return (
      <Card>
        <EmptyState icon="map" title="No stations or areas stored yet" />
      </Card>
    );
  }
  await connection();
  return <PollutionMap stations={data.stations} areas={data.areas} generatedAt={new Date().toISOString()} />;
}
