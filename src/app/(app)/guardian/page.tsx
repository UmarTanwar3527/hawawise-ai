import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/states";
import { GuardianChat } from "@/features/ai-guardian/components/guardian-chat";
import { isGeminiConfigured } from "@/lib/gemini/client";

export const metadata: Metadata = {
  title: "Air Guardian",
};

export default function GuardianPage({ searchParams }: PageProps<"/guardian">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="AI assistant"
        title="Air Guardian"
        description="Ask about Jaipur's air. Answers are grounded in stored station and model data, with sources and times."
      />
      <div role="note" className="flex gap-3 rounded-xl border border-blue-200 bg-primary-soft p-4 text-sm leading-6 text-primary-strong">
        <Icon name="info" size={18} className="mt-0.5 shrink-0" />
        Air Guardian gives general air-quality information. It does not diagnose conditions or replace advice from a medical professional.
      </div>
      <Suspense fallback={<Skeleton className="h-[560px] w-full rounded-card" />}>
        <GuardianContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function GuardianContent({ searchParams }: { searchParams: PageProps<"/guardian">["searchParams"] }) {
  // The configuration check reads server environment at request time.
  await connection();
  const { q } = await searchParams;
  // Pre-fill only (never auto-sent); same length limit as the chat API.
  const initialQuestion = typeof q === "string" ? q.trim().slice(0, 1000) : "";
  if (!isGeminiConfigured()) {
    return (
      <Card>
        <EmptyState
          icon="chat"
          title="Air Guardian is not configured"
          description="The AI service key is not set on this deployment. No AI answers are shown."
        />
      </Card>
    );
  }
  return <GuardianChat initialQuestion={initialQuestion} />;
}
