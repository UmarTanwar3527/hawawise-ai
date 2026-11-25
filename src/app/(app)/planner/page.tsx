import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Exposure planner",
};

export default function PlannerPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Plan your day"
        title="Exposure planner"
        description="Compare time windows for an outdoor activity using forecast air quality."
      />
      <ModulePlaceholder
        icon="calendar"
        notice="The planner compares options using available data. It will not describe any activity as completely safe based on AQI alone."
        capabilities={[
          "Choose an activity, a Jaipur area and the times you are available.",
          "Compare windows using the provider forecast, with uncertainty shown.",
          "Recommendations only where the data supports them.",
        ]}
        dependencies={[
          "Forecast integration for Jaipur (Google Air Quality API).",
          "Exposure evaluation rules (evaluate_exposure).",
          "Safety validation shared with Air Guardian.",
        ]}
      />
    </div>
  );
}
