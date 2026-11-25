import { Badge, type BadgeTone } from "@/components/ui/badge";

import type { DataProvenance } from "../types/aqi";

export const PROVENANCE_DETAILS: Record<
  DataProvenance,
  { label: string; description: string; tone: BadgeTone }
> = {
  measured: {
    label: "Measured",
    description: "Observed by a physical monitoring station.",
    tone: "success",
  },
  modelled: {
    label: "Modelled",
    description:
      "Estimated by a spatial model for the area. Not a station measurement.",
    tone: "info",
  },
  forecast: {
    label: "Forecast",
    description: "A provider prediction for a future time. Not an observation.",
    tone: "warning",
  },
};

/** Labels every displayed value with where it came from. */
export function ProvenanceBadge({ kind }: { kind: DataProvenance }) {
  const details = PROVENANCE_DETAILS[kind];
  return (
    <Badge tone={details.tone} dot title={details.description}>
      {details.label}
    </Badge>
  );
}
