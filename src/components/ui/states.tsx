import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

import { Icon, type IconName } from "./icon";

type StateProps = {
  title: string;
  description?: ReactNode;
  icon?: IconName;
  /** Optional actions such as a retry button or a navigation link. */
  children?: ReactNode;
  headingLevel?: "h1" | "h2" | "h3";
  /** Compact variant for use inside dashboard panels. */
  compact?: boolean;
  className?: string;
};

type StateBlockProps = StateProps & {
  icon: IconName;
  iconClassName: string;
  role?: "alert";
};

function StateBlock({
  title,
  description,
  icon,
  iconClassName,
  role,
  children,
  headingLevel: Heading = "h2",
  compact = false,
  className,
}: StateBlockProps) {
  return (
    <div
      role={role}
      className={cn(
        "flex flex-col items-center text-center",
        compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-12",
        className,
      )}
    >
      <span
        className={cn(
          "grid place-items-center rounded-full border",
          compact ? "size-10" : "size-12",
          iconClassName,
        )}
      >
        <Icon name={icon} size={compact ? 18 : 22} />
      </span>
      <Heading
        className={cn("font-semibold text-ink", compact ? "text-sm" : "text-base")}
      >
        {title}
      </Heading>
      {description ? (
        <div
          className={cn(
            "max-w-md text-ink-subtle",
            compact ? "text-xs leading-5" : "text-sm leading-6",
          )}
        >
          {description}
        </div>
      ) : null}
      {children ? (
        <div className="mt-2 flex flex-wrap justify-center gap-2">{children}</div>
      ) : null}
    </div>
  );
}

/**
 * Shown when a section has nothing to display yet, e.g. a provider that is
 * not connected. Never use it to hide a failure; use ErrorState for that.
 */
export function EmptyState({ icon = "info", ...props }: StateProps) {
  return (
    <StateBlock
      icon={icon}
      iconClassName="border-line bg-canvas text-ink-subtle"
      {...props}
    />
  );
}

/** Shown when something failed. Announced to assistive technology. */
export function ErrorState({ icon = "alert", ...props }: StateProps) {
  return (
    <StateBlock
      icon={icon}
      role="alert"
      iconClassName="border-red-200 bg-red-50 text-red-700"
      {...props}
    />
  );
}
