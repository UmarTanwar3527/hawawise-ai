import Link from "next/link";

import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils/cn";

type LogoProps = {
  tone?: "dark" | "light";
  href?: string;
  className?: string;
};

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className={cn("size-8 shrink-0", className)}
    >
      <rect width="32" height="32" rx="9" fill="#2563EB" />
      <path
        d="M8 12.5h10.5a3 3 0 1 0-3-3M8 17h14a3 3 0 1 1-3 3M8 21.5h6"
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({ tone = "dark", href = "/", className }: LogoProps) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2.5 rounded-lg", className)}
    >
      <LogoMark />
      <span
        className={cn(
          "text-[15px] font-semibold tracking-tight whitespace-nowrap",
          tone === "dark" ? "text-ink" : "text-white",
        )}
      >
        {siteConfig.shortName}
        <span className={tone === "dark" ? "text-primary" : "text-blue-300"}>
          {" "}
          AI
        </span>
      </span>
    </Link>
  );
}
