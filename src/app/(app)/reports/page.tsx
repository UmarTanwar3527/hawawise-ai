import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Civic reports",
};

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Community"
        title="Civic reports"
        description="Report pollution incidents such as waste burning or construction dust, and track their status."
        actions={
          <ButtonLink href="/reports/new">
            <Icon name="plus" size={16} />
            New report
          </ButtonLink>
        }
      />
      <ModulePlaceholder
        icon="flag"
        notice="Reports are community submissions within Hawa AI. They are not official complaints to any municipal or government authority."
        capabilities={[
          "See your submitted reports and their review status.",
          "Reports stay private to you unless you choose otherwise.",
          "Area-level patterns that feed City insights.",
        ]}
        dependencies={[
          "Supabase Auth for signed-in reporting.",
          "civic_reports table protected by Row Level Security.",
          "Private Supabase Storage bucket for report images.",
        ]}
      />
    </div>
  );
}
