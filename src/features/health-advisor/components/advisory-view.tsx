import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { ProvenanceBadge } from "@/features/air-quality/components/provenance-badge";
import { CPCB_AQI_CATEGORIES } from "@/features/air-quality/cpcb-aqi-scale";
import { POLLUTANT_LABELS, type PollutantCode } from "@/features/air-quality/types/aqi";
import { cn } from "@/lib/utils/cn";
import { formatAge, formatDateTimeIst } from "@/lib/utils/format";

import { ACTIVITIES, PROFILES, SOURCES, type SourceId } from "../constants";
import type { Advisory, AdvisoryItem, Verdict } from "../rules";

const VERDICT: Record<Verdict, { label: string; tone: BadgeTone }> = {
  go: { label: "No special precautions", tone: "success" },
  adjust: { label: "Adjust", tone: "info" },
  limit: { label: "Limit", tone: "warning" },
  avoid: { label: "Avoid outdoors", tone: "warning" },
  indoors: { label: "Stay indoors", tone: "danger" },
};

function SourceTag({ source }: { source: SourceId }) {
  const official = source !== "hawa";
  return (
    <span
      className={cn(
        "ml-1.5 inline-flex rounded px-1.5 py-px align-middle text-[11px] font-medium whitespace-nowrap",
        official ? "bg-green-50 text-green-800" : "bg-primary-soft text-primary-strong",
      )}
    >
      {official ? SOURCES[source].short : "Hawa AI"}
    </span>
  );
}

function ItemList({ title, items, icon }: { title: string; items: AdvisoryItem[]; icon: "check" | "close" | "home" }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Icon name={icon} size={16} className="text-ink-subtle" />
        {title}
      </h3>
      <ul className="mt-2 flex flex-col gap-2 text-sm text-ink-muted">
        {items.map((item) => (
          <li key={item.text} className="leading-6">
            {item.text}
            <SourceTag source={item.source} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AdvisoryView({ advisory, areaName, now }: { advisory: Advisory; areaName: string; now: Date }) {
  const m = advisory.measurement;
  const category = m ? CPCB_AQI_CATEGORIES.find((c) => c.id === m.category) : null;
  const verdict = advisory.verdict ? VERDICT[advisory.verdict] : null;
  const ageMinutes = m ? Math.max(0, Math.round((now.getTime() - Date.parse(m.observedAt)) / 60_000)) : null;
  const dominant = m?.dominantPollutant ? (POLLUTANT_LABELS[m.dominantPollutant as PollutantCode] ?? m.dominantPollutant) : null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader
          title="Your advisory"
          description={`${PROFILES[advisory.profile].label} · ${ACTIVITIES[advisory.activity].label} · ${areaName}`}
          action={m ? <ProvenanceBadge kind="measured" /> : null}
        />
        <div className="flex flex-col gap-5 p-5">
          <div className="rounded-xl border border-line bg-canvas p-4">
            <div className="flex flex-wrap items-center gap-2">
              {verdict ? <Badge tone={verdict.tone}>{verdict.label}</Badge> : <Badge tone="neutral">No current reading</Badge>}
              {advisory.status === "stale" ? <Badge tone="warning">Stale reading</Badge> : null}
            </div>
            <p className="mt-2 text-lg font-semibold text-ink">{advisory.headline}</p>
            {m && category ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-muted">
                <span className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold text-ink tabular-nums">
                    {m.aqi}
                    {m.isLowerBound ? "+" : ""}
                  </span>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", category.chipClass)}>{category.label}</span>
                </span>
                {dominant ? <span>Dominant pollutant: <strong className="text-ink">{dominant}</strong></span> : null}
                <span>
                  {m.stationName}, {m.distanceKm} km · {formatDateTimeIst(m.observedAt)}
                  {ageMinutes !== null ? ` (${formatAge(ageMinutes)} ago)` : ""}
                </span>
              </div>
            ) : null}
            {m ? <p className="mt-2 text-xs text-ink-subtle">India AQI (CPCB), calculated by Hawa AI from station measurements.</p> : null}
          </div>

          {advisory.official ? (
            <figure className="rounded-xl border border-green-200 bg-green-50/60 p-4">
              <p className="text-xs font-semibold tracking-wide text-green-900 uppercase">Official guidance</p>
              <blockquote className="mt-1 text-base font-medium text-ink">&ldquo;{advisory.official.applies}&rdquo;</blockquote>
              <p className="mt-2 text-sm text-ink-muted">
                <span className="font-medium text-ink">Possible health effects: </span>
                {advisory.official.healthEffects}.
              </p>
              <figcaption className="mt-2 text-xs text-ink-subtle">
                Advice for {advisory.group === "vulnerable" ? "vulnerable population" : "general population"} at this AQI category ·{" "}
                <a href={SOURCES.mohfw.url} target="_blank" rel="noreferrer" className="text-primary underline">
                  {SOURCES.mohfw.label}
                </a>
              </figcaption>
            </figure>
          ) : null}

          <ItemList title="Recommended actions" items={advisory.actions} icon="check" />
          <ItemList title="What to avoid" items={advisory.avoid} icon="close" />
          <ItemList title="At home" items={advisory.atHome} icon="home" />

          {advisory.warnings.length ? (
            <ul className="flex flex-col gap-2">
              {advisory.warnings.map((w) => (
                <li key={w.text} className="flex gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
                  <Icon name="info" size={16} className="mt-0.5 shrink-0" />
                  <span>
                    {w.text}
                    <SourceTag source={w.source} />
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Card>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title="When to check again" />
          <p className="p-5 pt-3 text-sm text-ink-muted">
            {advisory.recheck.text}
            <SourceTag source={advisory.recheck.source} />
          </p>
        </Card>
        <Card>
          <CardHeader title="If you feel unwell" />
          <ul className="flex flex-col gap-2 p-5 pt-3 text-sm text-ink-muted">
            {advisory.symptoms.map((s) => (
              <li key={s.text}>
                {s.text}
                <SourceTag source={s.source} />
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader
            title="Lower-exposure times"
            action={
              advisory.forecast.status === "ok" ? (
                <span className="flex gap-1.5">
                  <ProvenanceBadge kind="forecast" />
                  <ProvenanceBadge kind="modelled" />
                </span>
              ) : null
            }
          />
          <div className="flex flex-col gap-3 p-5 pt-3 text-sm text-ink-muted">
            {advisory.forecast.status === "ok" ? (
              <p>
                Comparatively lower forecast particle levels {advisory.forecast.day} around{" "}
                <strong className="text-ink">{advisory.forecast.lowestWindow}</strong>. Modelled values; use them to compare times, not as
                actual levels.
              </p>
            ) : (
              <p>The forecast is not available right now, so no time comparison is shown.</p>
            )}
            <ButtonLink href="/planner" variant="secondary" size="sm" className="self-start">
              <Icon name="calendar" size={14} />
              Compare times in the planner
            </ButtonLink>
          </div>
        </Card>
        <Card>
          <CardHeader title="Sources" />
          <ul className="flex flex-col gap-2 p-5 pt-3 text-sm">
            {(["mohfw", "cpcb", "who"] as const).map((id) => (
              <li key={id}>
                <a href={SOURCES[id].url} target="_blank" rel="noreferrer" className="text-primary underline">
                  {SOURCES[id].label}
                </a>
              </li>
            ))}
            <li className="text-ink-muted">{SOURCES.hawa.label}</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
