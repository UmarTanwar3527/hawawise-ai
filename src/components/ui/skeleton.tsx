import { cn } from "@/lib/utils/cn";

/** Decorative loading block. Wrap groups in a labelled `role="status"`. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-ink/[0.07]", className)}
    />
  );
}
