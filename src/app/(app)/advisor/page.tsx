import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { ExplanationCard } from "@/features/ai-guardian/components/explanation-card";
import type { AreaSummary } from "@/features/air-quality/services/area-air-quality";
import { getAreasCached } from "@/features/air-quality/services/dashboard-data";
import { AdvisorForm } from "@/features/health-advisor/components/advisor-form";
import { AdvisoryView } from "@/features/health-advisor/components/advisory-view";
import { EMERGENCY_NUMBERS } from "@/features/health-advisor/constants";
import { advisorRequestFromSearchParams } from "@/features/health-advisor/schemas/advisor-request";
import { loadAdvisory } from "@/features/health-advisor/services/advisor";
import { isGeminiConfigured } from "@/lib/gemini/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Health advisor",
};

export default function AdvisorPage({ searchParams }: PageProps<"/advisor">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="What should I do?"
        title="Health advisor"
        description="Practical steps to reduce your exposure, based on the latest measured AQI and official public-health guidance (MoHFW, CPCB, WHO)."
      />
      <div role="note" className="flex gap-3 rounded-xl border border-blue-200 bg-primary-soft p-4 text-sm leading-6 text-primary-strong">
        <Icon name="shield" size={18} className="mt-0.5 shrink-0" />
        <p>
          General environmental health information, not individual medical advice. It does not diagnose conditions or replace your
          doctor. For severe breathlessness, chest pain or fainting, seek urgent medical care: call {EMERGENCY_NUMBERS}.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-card" />}>
        <AdvisorContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function AdvisorContent({ searchParams }: { searchParams: PageProps<"/advisor">["searchParams"] }) {
  const parsed = advisorRequestFromSearchParams(await searchParams);
  if (!parsed.success) notFound();
  const request = parsed.data;
  if (!isSupabaseConfigured()) {
    return (
      <Card>
        <ErrorState title="Air-quality storage is not configured" />
      </Card>
    );
  }

  let areas: AreaSummary[];
  try {
    areas = await getAreasCached();
  } catch {
    return <Unavailable />;
  }
  if (!areas.some((a) => a.slug === request.location)) notFound();

  await connection();
  const now = new Date();
  let result: Awaited<ReturnType<typeof loadAdvisory>>;
  try {
    result = await loadAdvisory(request, now);
  } catch (error) {
    console.error("advisor failed", error instanceof Error ? error.name : "unknown");
    return <Unavailable />;
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-5">
        <AdvisorForm areas={areas} value={request} />
      </Card>
      <AdvisoryView advisory={result.advisory} areaName={result.current.location.name} now={now} />
      <ExplanationCard
        endpoint="/api/advisor/explain"
        payload={request}
        enabled={isGeminiConfigured()}
        description="Gemini explains the advice above in plain language. It cannot change the advice, diagnose, or mention medicines, and every figure is checked against the data."
        basis="The advice above comes from official guidance and does not depend on AI."
      />
    </div>
  );
}

function Unavailable() {
  return (
    <Card>
      <ErrorState
        title="Air-quality data is temporarily unavailable"
        description="No advice is shown rather than guessing. General precautions: avoid heavy traffic and smoke, and check the AQI again later."
      />
    </Card>
  );
}
