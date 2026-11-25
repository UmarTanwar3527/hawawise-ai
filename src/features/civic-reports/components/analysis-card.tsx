import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";

import { categoryLabel, VISIBLE_SEVERITY } from "../constants";
import type { PhotoAnalysis } from "../schemas";

const ISSUE_COPY: Record<PhotoAnalysis["imageIssue"], string> = {
  none: "",
  not_outdoor_scene: "This doesn't look like an outdoor scene where a pollution source could be seen.",
  too_dark_or_blurry: "The photo is too dark or blurry to assess.",
  screenshot_or_artwork: "This looks like a screenshot, document or artwork rather than a photo.",
  inappropriate: "This photo can't be used for a report.",
};

/** The AI's reading of the photo, with its limits stated plainly. */
export function AnalysisCard({ analysis }: { analysis: PhotoAnalysis }) {
  if (!analysis.canSubmit) {
    return (
      <div role="alert" className="flex gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
        <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">This photo can&apos;t be used for a report</p>
          <p className="mt-1">{ISSUE_COPY[analysis.imageIssue]} Try a clear outdoor photo of the pollution source.</p>
        </div>
      </div>
    );
  }

  const percent = Math.round(analysis.confidence * 100);
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line bg-canvas p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-ink-subtle uppercase">AI suggestion</p>
          <p className="mt-1 text-lg font-semibold text-ink">{categoryLabel(analysis.category)}</p>
        </div>
        <Badge tone="info">
          <Icon name="sparkle" size={12} />
          AI-generated
        </Badge>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-ink-subtle">Model confidence</dt>
          <dd className="mt-0.5 font-medium text-ink">
            {percent}%{" "}
            <span className="text-xs font-normal text-ink-subtle">
              ({percent >= 75 ? "high" : percent >= 50 ? "medium" : "low"}; the model&apos;s own estimate, not calibrated)
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-subtle">Visible intensity</dt>
          <dd className="mt-0.5 font-medium text-ink">
            {VISIBLE_SEVERITY[analysis.visibleSeverity]}{" "}
            <span className="text-xs font-normal text-ink-subtle">(how much smoke or dust is visible, not an AQI)</span>
          </dd>
        </div>
      </dl>

      <div>
        <h4 className="text-xs font-semibold text-ink-subtle">What the AI can see</h4>
        <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-sm text-ink">
          {analysis.observations.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </div>

      {analysis.recommendations.length ? (
        <div>
          <h4 className="text-xs font-semibold text-ink-subtle">Possible actions</h4>
          <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-sm text-ink-muted">
            {analysis.recommendations.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <h4 className="text-xs font-semibold text-ink-subtle">Limitations</h4>
        <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-xs text-ink-muted">
          {analysis.limitations.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </div>

      {analysis.peopleVisible || analysis.licencePlatesReadable ? (
        <p className="flex gap-2 rounded-lg border border-line bg-surface p-3 text-xs text-ink-muted">
          <Icon name="shield" size={14} className="mt-0.5 shrink-0 text-ink-subtle" />
          {analysis.licencePlatesReadable ? "A number plate may be readable" : "People may be visible"} in this photo. Photos
          are never published; they are kept privately for review only.
        </p>
      ) : null}
    </div>
  );
}
