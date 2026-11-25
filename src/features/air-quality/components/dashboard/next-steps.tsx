import Link from "next/link";

import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils/cn";

/** Links from the current reading to the modules that act on it. Carries the selected area. */
export function NextSteps({ slug, areaName, className }: { slug: string; areaName: string; className?: string }) {
  const steps: { href: string; title: string; body: string; icon: IconName }[] = [
    {
      href: `/guardian?q=${encodeURIComponent(`What should I know about the air in ${areaName} today?`)}`,
      title: "Ask Air Guardian",
      body: "Grounded answers with sources, in English or Hindi.",
      icon: "chat",
    },
    {
      href: `/planner?location=${encodeURIComponent(slug)}`,
      title: "Plan outdoor time",
      body: "Compare forecast windows for a walk, run or ride.",
      icon: "calendar",
    },
    {
      href: "/reports/new",
      title: "Report pollution",
      body: "Photograph smoke or dust; AI classifies it.",
      icon: "flag",
    },
    {
      href: "/insights",
      title: "See city insights",
      body: "7-day trends, stations and the daily rhythm.",
      icon: "chart",
    },
  ];
  return (
    <nav aria-label="Act on this reading" className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {steps.map((step) => (
        <Link
          key={step.title}
          href={step.href}
          className="group flex items-start gap-3 rounded-card border border-line bg-surface p-4 shadow-card transition hover:border-primary/40 hover:shadow-raised"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
            <Icon name={step.icon} size={18} />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-sm font-semibold text-ink">
              {step.title}
              <Icon name="arrowRight" size={14} className="text-primary transition-transform group-hover:translate-x-0.5" />
            </span>
            <span className="mt-0.5 block text-xs leading-5 text-ink-muted">{step.body}</span>
          </span>
        </Link>
      ))}
    </nav>
  );
}
