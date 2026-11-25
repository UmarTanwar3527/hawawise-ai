import { cn } from "@/lib/utils/cn";

import { CPCB_AQI_CATEGORIES } from "../cpcb-aqi-scale";

/**
 * Reference legend for the CPCB AQI bands. It shows the scale only; it does
 * not represent a reading.
 */
export function AqiScaleLegend({ className }: { className?: string }) {
  return (
    <figure className={cn("w-full", className)}>
      <ol
        aria-label="India National AQI (CPCB) categories"
        className="grid grid-cols-3 gap-x-1 gap-y-3 sm:grid-cols-6"
      >
        {CPCB_AQI_CATEGORIES.map((category) => (
          <li key={category.id} className="min-w-0">
            <span
              aria-hidden="true"
              className={cn("block h-1.5 rounded-full", category.swatchClass)}
            />
            <span className="mt-1.5 block truncate text-xs font-medium text-ink">
              {category.label}
            </span>
            <span className="block font-mono text-[11px] text-ink-subtle tabular-nums">
              {category.min}–{category.max}
            </span>
          </li>
        ))}
      </ol>
      <figcaption className="mt-3 text-xs text-ink-subtle">
        India National AQI (CPCB) scale reference — not a reading.
      </figcaption>
    </figure>
  );
}
