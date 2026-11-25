import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "New report",
};

export default function NewReportPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Civic reports"
        title="New report"
        description="Describe a pollution incident, add its location and upload a photo."
        actions={
          <ButtonLink href="/reports" variant="secondary">
            <Icon name="arrowLeft" size={16} />
            All reports
          </ButtonLink>
        }
      />
      <ModulePlaceholder
        icon="plus"
        notice="Submitting a report here will not file an official complaint with any authority."
        capabilities={[
          "Category, description and location (map pin or Jaipur area).",
          "Photo upload to private storage.",
          "AI-suggested incident category that you review before submitting.",
        ]}
        dependencies={[
          "Supabase Auth and Storage policies for report images.",
          "Server-side input validation and upload limits.",
          "Gemini vision classification, called only from the server.",
        ]}
      />
    </div>
  );
}
