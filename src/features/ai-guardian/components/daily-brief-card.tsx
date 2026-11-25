import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Markdown } from "@/components/ui/markdown";
import { EmptyState } from "@/components/ui/states";
import type { DailyBrief } from "@/features/air-quality/services/dashboard-data";
import { formatDateTimeIst } from "@/lib/utils/format";

const STALE_AFTER_HOURS = 6;

/** AI Daily Air Brief, shown on the dashboard. Content is read from storage only. */
export function DailyBriefCard({ brief, now, className }: { brief: DailyBrief | null; now: Date; className?: string }) {
  if (!brief) {
    return (
      <Card className={className}>
        <CardHeader
          title="AI daily air brief"
          description="What is happening with Jaipur's air today?"
          action={<Badge tone="neutral">No summary</Badge>}
        />
        <EmptyState
          compact
          headingLevel="h3"
          icon="sparkle"
          title="No AI summary available yet"
          description="A summary is generated only when enough fresh station data is available. Measured values above are unaffected."
        />
      </Card>
    );
  }

  const stale = now.getTime() - Date.parse(brief.dataAsOf) > STALE_AFTER_HOURS * 3_600_000;
  const sources = [...new Set(brief.evidence.map((e) => (e.dataKind === "measured" ? "Station measurements (OpenAQ, CPCB/RSPCB)" : e.dataKind === "reference" ? e.source : "Open-Meteo model")))];

  return (
    <Card className={className}>
      <CardHeader
        title="AI daily air brief"
        description="What is happening with Jaipur's air today? AI-generated summary based on available environmental data."
        action={
          <span className="flex items-center gap-1.5">
            {stale ? <Badge tone="warning">Stale</Badge> : null}
            <Badge tone="info">
              <Icon name="sparkle" size={11} />
              AI
            </Badge>
          </span>
        }
      />
      <div className="flex flex-col gap-3 p-5">
        <p className="font-semibold text-ink">{brief.content.headline}</p>
        <Markdown text={brief.content.summary} />
        {brief.content.highlights.length ? (
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-6 text-ink-muted">
            {brief.content.highlights.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        ) : null}
        {brief.content.guidance.length ? (
          <div className="rounded-xl border border-line bg-canvas p-3">
            <p className="text-xs font-semibold text-ink">General guidance</p>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-sm leading-6 text-ink-muted">
              {brief.content.guidance.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {[...(stale ? ["This summary is based on data more than 6 hours old."] : []), ...brief.content.warnings].map((warning, index) => (
          <p key={index} className="flex gap-1.5 text-xs leading-5 text-yellow-800">
            <Icon name="alert" size={12} className="mt-0.5 shrink-0" />
            {warning}
          </p>
        ))}
        <p className="text-xs leading-5 text-ink-subtle">
          Generated {formatDateTimeIst(brief.generatedAt)} · data up to {formatDateTimeIst(brief.dataAsOf)}
          {sources.length ? ` · Sources: ${sources.join("; ")}` : ""}. General information, not medical advice.
        </p>
        <ButtonLink href="/guardian" variant="secondary" size="sm" className="self-start">
          Ask Air Guardian
        </ButtonLink>
      </div>
    </Card>
  );
}
