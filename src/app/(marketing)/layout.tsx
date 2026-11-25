import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/layout/logo";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { siteConfig } from "@/config/site";

const sectionLinks = [
  { href: "/#modules", label: "What it does" },
  { href: "/demo", label: "Guided demo" },
  { href: "/#data-integrity", label: "Data integrity" },
  { href: "/#principles", label: "Principles" },
];

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Logo />
          <nav aria-label="Sections" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {sectionLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-ink-muted hover:bg-ink/5 hover:text-ink"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <ButtonLink href="/dashboard" size="sm" className="ml-auto">
            Open dashboard
            <Icon name="arrowRight" size={16} />
          </ButtonLink>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-3 text-sm leading-6 text-ink-subtle">
              {siteConfig.description}
            </p>
          </div>
          <p className="max-w-md text-xs leading-5 text-ink-subtle">
            {siteConfig.name} is in active development. It provides general
            air-quality information, not medical advice. Community reports
            submitted in {siteConfig.name} are not official complaints to
            any authority.
          </p>
        </div>
      </footer>
    </div>
  );
}
