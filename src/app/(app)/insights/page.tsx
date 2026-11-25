import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "City insights",
};

export default function InsightsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Trends"
        title="City insights"
        description="Trends and hotspots across Jaipur over time."
      />
      <ModulePlaceholder
        icon="chart"
        capabilities={[
          "Daily and weekly trends from stored readings.",
          "Area comparisons that only compare values on the same AQI standard and provider.",
          "Station observations shown separately from modelled estimates.",
        ]}
        dependencies={[
          "Scheduled ingestion of provider readings into Supabase.",
          "Historical data from the Google Air Quality API (up to 30 days).",
          "OpenAQ station observations, where available for Jaipur.",
        ]}
      />
    </div>
  );
}
