import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Manage your profile, language and preferences."
      />
      <ModulePlaceholder
        icon="sliders"
        capabilities={[
          "Profile name and avatar.",
          "Language: English or हिन्दी (Hindi).",
          "Preferred outdoor activities for personalised guidance.",
          "Notification preferences for air-quality alerts.",
        ]}
        dependencies={[
          "Supabase Auth.",
          "user_profiles and user_preferences tables with Row Level Security.",
        ]}
      />
    </div>
  );
}
