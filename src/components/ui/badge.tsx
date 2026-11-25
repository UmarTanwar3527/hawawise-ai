import type { ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

export type BadgeTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "placeholder"
  | "inverse";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "border-line bg-canvas text-ink-muted",
  info: "border-blue-200 bg-primary-soft text-primary-strong",
  success: "border-green-200 bg-green-50 text-green-800",
  warning: "border-yellow-200 bg-yellow-50 text-yellow-800",
  danger: "border-red-200 bg-red-50 text-red-800",
  placeholder: "border-dashed border-line-strong bg-surface text-ink-muted",
  inverse: "border-white/15 bg-white/10 text-white",
};

type BadgeProps = ComponentProps<"span"> & {
  tone?: BadgeTone;
  /** Shows a small leading status dot in the current text colour. */
  dot?: boolean;
};

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {dot ? (
        <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      ) : null}
      {children}
    </span>
  );
}
