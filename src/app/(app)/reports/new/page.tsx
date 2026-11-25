import type { Metadata } from "next";
import { Suspense } from "react";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { getServerEnv } from "@/config/env";
import { getAreasCached } from "@/features/air-quality/services/dashboard-data";
import type { AreaSummary } from "@/features/air-quality/services/area-air-quality";
import { ReportWizard } from "@/features/civic-reports/components/report-wizard";
import { isGeminiConfigured } from "@/lib/gemini/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Report pollution",
};

export default function NewReportPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Civic reports"
        title="Report pollution"
        description="Photograph a pollution source. AI suggests what it shows; you confirm it and pin the location. No account needed."
        actions={
          <ButtonLink href="/reports" variant="secondary">
            <Icon name="arrowLeft" size={16} />
            All reports
          </ButtonLink>
        }
      />
      <div role="note" className="flex gap-3 rounded-xl border border-blue-200 bg-primary-soft p-4 text-sm leading-6 text-primary-strong">
        <Icon name="info" size={18} className="mt-0.5 shrink-0" />
        Reports are community submissions within Hawa AI, not official complaints to any authority. A photo cannot measure
        air quality, so no AQI is inferred from it.
      </div>
      <Suspense fallback={<Skeleton className="h-72 w-full rounded-card" />}>
        <Reporter />
      </Suspense>
    </div>
  );
}

async function Reporter() {
  if (!isSupabaseConfigured() || !isGeminiConfigured() || !getServerEnv().SUPABASE_SERVICE_ROLE_KEY) {
    return (
      <Card>
        <ErrorState title="Reporting is not configured" description="Photo analysis and report storage need server configuration." />
      </Card>
    );
  }
  let areas: AreaSummary[] = [];
  try {
    areas = await getAreasCached();
  } catch (error) {
    // The map pin and device location still work without the area list.
    console.error("report areas failed", error instanceof Error ? error.name : "unknown");
  }
  return <ReportWizard areas={areas.map(({ slug, name, latitude, longitude }) => ({ slug, name, latitude, longitude }))} />;
}
