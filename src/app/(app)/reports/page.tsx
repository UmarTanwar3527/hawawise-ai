import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { categoryLabel, VERIFICATION_LABELS, VISIBLE_SEVERITY, type VisibleSeverity } from "@/features/civic-reports/constants";
import type { PublicReport } from "@/features/civic-reports/schemas";
import { getPublicReports } from "@/features/civic-reports/services/reports";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatDateTimeIst } from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "Civic reports",
};

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Community"
        title="Civic reports"
        description="Pollution sources reported by people in Jaipur, with an AI reading of each photo. Community submissions, not official complaints."
        actions={
          <ButtonLink href="/reports/new">
            <Icon name="plus" size={16} />
            Report pollution
          </ButtonLink>
        }
      />
      <Suspense fallback={<Skeleton className="h-72 w-full rounded-card" />}>
        <ReportList />
      </Suspense>
      <Card>
        <CardHeader title="How reporting works" />
        <ol className="flex list-decimal flex-col gap-2 p-5 pl-10 text-sm text-ink-muted">
          <li>Your browser removes location data and other metadata from the photo before uploading it.</li>
          <li>Gemini describes what is visible and suggests a category, with its confidence and limitations. It never estimates AQI from a photo.</li>
          <li>You confirm the category and pin the location. No account is needed; submissions are rate-limited.</li>
          <li>The public sees only the category, the AI label, the visible intensity, an approximate location (about 110 m) and the time. Photos and descriptions stay private for review.</li>
        </ol>
      </Card>
    </div>
  );
}

async function ReportList() {
  if (!isSupabaseConfigured()) {
    return (
      <Card>
        <ErrorState title="Report storage is not configured" />
      </Card>
    );
  }
  let reports: PublicReport[];
  try {
    reports = await getPublicReports(50);
  } catch (error) {
    console.error("reports list failed", error instanceof Error ? error.name : "unknown");
    return (
      <Card>
        <ErrorState title="Reports are temporarily unavailable" description="Please try again in a moment." />
      </Card>
    );
  }
  await connection();
  if (reports.length === 0) {
    return (
      <Card>
        <EmptyState icon="flag" title="No reports yet" description="Be the first to report a visible pollution source in Jaipur.">
          <ButtonLink href="/reports/new">Report pollution</ButtonLink>
        </EmptyState>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader title="Recent reports" description={`${reports.length} most recent published reports`} />
      <ul className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((report) => (
          <li key={report.id} className="flex flex-col gap-2 rounded-lg border border-line p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="font-semibold text-ink">{categoryLabel(report.category)}</h3>
              <Badge tone={report.verificationStatus === "verified" ? "success" : "neutral"}>
                {VERIFICATION_LABELS[report.verificationStatus] ?? report.verificationStatus}
              </Badge>
            </div>
            <p className="text-xs text-ink-subtle">{formatDateTimeIst(report.createdAt)}</p>
            {report.aiCategory ? (
              <p className="text-sm text-ink-muted">
                AI reading: {categoryLabel(report.aiCategory)}
                {report.aiConfidence !== null ? ` (${Math.round(report.aiConfidence * 100)}% model confidence)` : ""}
                {report.visibleSeverity && report.visibleSeverity !== "unclear"
                  ? `, ${VISIBLE_SEVERITY[report.visibleSeverity as VisibleSeverity]?.toLowerCase() ?? report.visibleSeverity} visible intensity`
                  : ""}
              </p>
            ) : null}
            <ButtonLink href={`/map?report=${report.id}`} variant="ghost" size="sm" className="self-start">
              <Icon name="map" size={14} />
              Show on map
            </ButtonLink>
          </li>
        ))}
      </ul>
    </Card>
  );
}
