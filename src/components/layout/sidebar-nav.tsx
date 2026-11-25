"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import {
  isNavItemActive,
  primaryNavigation,
  secondaryNavigation,
  type NavItem,
} from "@/config/navigation";
import { cn } from "@/lib/utils/cn";

type SidebarNavProps = {
  /** Called after a link is chosen, e.g. to close the mobile drawer. */
  onNavigate?: () => void;
};

export function SidebarNav({ onNavigate }: SidebarNavProps) {
  const pathname = usePathname();

  const renderItem = (item: NavItem) => {
    const active = isNavItemActive(pathname, item.href);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={cn(
            "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            active
              ? "bg-white/10 text-white"
              : "text-slate-300 hover:bg-white/5 hover:text-white",
          )}
        >
          <Icon
            name={item.icon}
            size={18}
            className={cn(
              "shrink-0",
              active ? "text-blue-300" : "text-slate-400 group-hover:text-slate-200",
            )}
          />
          {item.label}
        </Link>
      </li>
    );
  };

  return (
    <nav aria-label="Primary" className="flex flex-1 flex-col gap-6">
      <div>
        <p className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
          Modules
        </p>
        <ul className="flex flex-col gap-0.5">{primaryNavigation.map(renderItem)}</ul>
      </div>
      <div>
        <p className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
          Account
        </p>
        <ul className="flex flex-col gap-0.5">{secondaryNavigation.map(renderItem)}</ul>
      </div>
    </nav>
  );
}
