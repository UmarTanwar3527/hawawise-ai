import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/states";

type ModulePlaceholderProps = {
  icon: IconName;
  /** What the user will be able to do once the module is built. */
  capabilities: readonly string[];
  /** Integrations or work this module is waiting on. */
  dependencies: readonly string[];
  /** Important product boundary shown prominently (e.g. a disclaimer). */
  notice?: ReactNode;
};

/**
 * Clearly labelled development placeholder for modules that are not built
 * yet. It describes intent and dependencies and never renders sample data.
 */
export function ModulePlaceholder({
  icon,
  capabilities,
  dependencies,
  notice,
}: ModulePlaceholderProps) {
  return (
    <div className="flex flex-col gap-6">
      {notice ? (
        <div
          role="note"
          className="flex gap-3 rounded-xl border border-blue-200 bg-primary-soft p-4 text-sm leading-6 text-primary-strong"
        >
          <Icon name="info" size={18} className="mt-0.5 shrink-0" />
          <div>{notice}</div>
        </div>
      ) : null}

      <Card>
        <EmptyState
          icon={icon}
          title="This module is not connected yet"
          description="It will appear here once its data sources and services are integrated and verified. No sample or simulated data is shown in the meantime."
        >
          <Badge tone="placeholder">Development placeholder</Badge>
        </EmptyState>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader title="Planned capabilities" />
          <ul className="flex flex-col gap-3 p-5">
            {capabilities.map((item) => (
              <li key={item} className="flex gap-3 text-sm leading-6 text-ink-muted">
                <Icon name="check" size={18} className="mt-0.5 shrink-0 text-healthy" />
                {item}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Waiting on" />
          <ul className="flex flex-col gap-3 p-5">
            {dependencies.map((item) => (
              <li key={item} className="flex gap-3 text-sm leading-6 text-ink-muted">
                <Icon name="plug" size={18} className="mt-0.5 shrink-0 text-ink-subtle" />
                {item}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

type PanelPlaceholderProps = {
  title: string;
  /** Badge text; defaults to "No data". Use "Development placeholder" for unbuilt features. */
  badge?: string;
  description: string;
  icon: IconName;
  className?: string;
  children?: ReactNode;
};

/** A single dashboard panel in its "not connected" state. */
export function PanelPlaceholder({
  title,
  description,
  icon,
  badge = "No data",
  className,
  children,
}: PanelPlaceholderProps) {
  return (
    <Card className={className}>
      <CardHeader
        title={title}
        action={<Badge tone={badge === "No data" ? "neutral" : "placeholder"}>{badge}</Badge>}
      />
      <EmptyState
        compact
        headingLevel="h3"
        icon={icon}
        title="Not connected"
        description={description}
      />
      {children ? <div className="border-t border-line p-5">{children}</div> : null}
    </Card>
  );
}
