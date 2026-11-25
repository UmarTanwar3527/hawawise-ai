import { cn } from "@/lib/utils/cn";

import { CPCB_AQI_CATEGORIES } from "../cpcb-aqi-scale";
import type { CpcbAqiCategoryId } from "../types/aqi";

/**
 * Reference legend for the CPCB AQI bands. It shows the scale only; it does
 * not represent a reading.
 */
export function AqiScaleLegend({
  className,
  activeCategory,
}: {
  className?: string;
  /** Highlights the category of a value shown alongside the legend. */
  activeCategory?: CpcbAqiCategoryId;
}) {
  return (
    <figure className={cn("w-full", className)}>
      <ol
        aria-label="India National AQI (CPCB) categories"
        className="grid grid-cols-3 gap-x-1 gap-y-3 sm:grid-cols-6"
      >
        {CPCB_AQI_CATEGORIES.map((category) => (
          <li
            key={category.id}
            aria-current={category.id === activeCategory ? "true" : undefined}
            className="min-w-0"
          >
            <span
              aria-hidden="true"
              className={cn(
                "block rounded-full",
                category.id === activeCategory ? "h-2.5" : "h-1.5",
                activeCategory && category.id !== activeCategory ? "opacity-35" : undefined,
                category.swatchClass,
              )}
            />
            <span
              className={cn(
                "mt-1.5 block truncate text-xs text-ink",
                category.id === activeCategory ? "font-bold" : "font-medium",
              )}
            >
              {category.label}
            </span>
            <span className="block font-mono text-[11px] text-ink-subtle tabular-nums">
              {category.min}–{category.max}
            </span>
          </li>
        ))}
      </ol>
      <figcaption className="mt-3 text-xs text-ink-subtle">
        {activeCategory
          ? "India National AQI (CPCB) categories; the current category is highlighted."
          : "India National AQI (CPCB) scale reference — not a reading."}
      </figcaption>
    </figure>
  );
}
