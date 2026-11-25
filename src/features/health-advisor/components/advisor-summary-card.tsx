import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { CPCB_AQI_CATEGORIES } from "@/features/air-quality/cpcb-aqi-scale";
import { cn } from "@/lib/utils/cn";

import { PROFILES, SOURCES, type ProfileId } from "../constants";
import type { Advisory } from "../rules";
import { advisorHref } from "../schemas/advisor-request";

const QUICK_PROFILES: ProfileId[] = ["general", "child", "older_adult", "pregnant", "respiratory", "heart", "outdoor_worker"];

/** Dashboard section: "What should I do based on these conditions?" (rules engine, no AI). */
export function AdvisorSummaryCard({ advisory, slug, className }: { advisory: Advisory; slug: string; className?: string }) {
  const category = advisory.category ? CPCB_AQI_CATEGORIES.find((c) => c.id === advisory.category) : null;
  return (
    <Card className={className}>
      <CardHeader
        title="Health advisor"
        description="What should I do based on these conditions? Official guidance for the latest measured AQI."
        action={<Badge tone="success">Official guidance</Badge>}
      />
      <div className="flex flex-col gap-4 p-5">
        {advisory.official && category ? (
          <div className="grid gap-3">
            <div className="rounded-lg border border-line p-3">
              <p className="text-xs font-medium text-ink-subtle">General population</p>
              <p className="mt-1 font-medium text-ink">&ldquo;{advisory.official.general}&rdquo;</p>
            </div>
            <div className="rounded-lg border border-line p-3">
              <p className="text-xs font-medium text-ink-subtle">
                Vulnerable groups (children, older adults, pregnancy, heart or lung conditions, outdoor workers)
              </p>
              <p className="mt-1 font-medium text-ink">&ldquo;{advisory.official.vulnerable}&rdquo;</p>
            </div>
            <p className="text-xs text-ink-subtle">
              For AQI category{" "}
              <span className={cn("rounded-full px-2 py-0.5 font-semibold", category.chipClass)}>{category.label}</span>
              {advisory.status === "stale" ? " (from an out-of-date reading)" : ""} · {SOURCES.mohfw.short}
            </p>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">
            No current station measurement, so no level-specific advice. General precautions still apply: avoid heavy traffic and
            smoke, and check the AQI again later.
          </p>
        )}
        <div>
          <p className="text-xs font-medium text-ink-subtle">Advice for you</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {QUICK_PROFILES.map((profile) => (
              <li key={profile}>
                <Link
                  href={advisorHref({ location: slug, profile, activity: "outdoor" })}
                  className="inline-flex h-8 items-center rounded-full border border-line-control bg-surface px-3 text-xs font-medium text-ink hover:border-primary hover:text-primary-strong"
                >
                  {PROFILES[profile].label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <ButtonLink href={advisorHref({ location: slug })} size="sm" className="self-start">
          <Icon name="shield" size={14} />
          Open Health advisor
        </ButtonLink>
      </div>
    </Card>
  );
}
