import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Air Guardian",
};

export default function GuardianPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="AI assistant"
        title="Air Guardian"
        description="Ask questions about Jaipur's air and get answers grounded in retrieved data."
      />
      <ModulePlaceholder
        icon="chat"
        notice="Air Guardian provides general air-quality information. It does not diagnose conditions or replace advice from a medical professional."
        capabilities={[
          "Answers that cite the provider, AQI standard and observation time.",
          "Clear separation of measured, modelled and forecast values.",
          "Guidance drawn from approved WHO and CPCB reference documents.",
          "Responses in English and Hindi.",
          "An explicit statement when data is unavailable or stale.",
        ]}
        dependencies={[
          "Gemini API, called only from the server.",
          "The air-quality tool (get_air_quality) backed by verified provider data.",
          "Knowledge retrieval over WHO and CPCB documents.",
          "A deterministic safety-validation layer for recommendations.",
          "Supabase Auth to store each user's conversation history privately.",
        ]}
      />
    </div>
  );
}
