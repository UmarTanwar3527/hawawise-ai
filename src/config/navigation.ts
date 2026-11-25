import type { IconName } from "@/components/ui/icon";

export type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: IconName;
};

export const primaryNavigation: readonly NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    description: "Current Jaipur air-quality conditions",
    icon: "grid",
  },
  {
    href: "/map",
    label: "Pollution map",
    description: "Spatial pollution intelligence",
    icon: "map",
  },
  {
    href: "/guardian",
    label: "Air Guardian",
    description: "Evidence-grounded AI assistant",
    icon: "chat",
  },
  {
    href: "/planner",
    label: "Exposure planner",
    description: "Compare outdoor activity times",
    icon: "calendar",
  },
  {
    href: "/reports",
    label: "Civic reports",
    description: "Report pollution with a photo; AI classifies it",
    icon: "flag",
  },
  {
    href: "/insights",
    label: "City insights",
    description: "Trends, station comparison and daily patterns",
    icon: "chart",
  },
];

/**
 * Secondary links. Settings is not listed while sign-in is set aside (its page
 * is still a labelled placeholder at /settings).
 */
export const secondaryNavigation: readonly NavItem[] = [
  {
    href: "/demo",
    label: "Guided demo",
    description: "A 3-minute tour on live data, with readiness checks",
    icon: "sparkle",
  },
];

/** True when `pathname` is the item's route or one of its child routes. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
