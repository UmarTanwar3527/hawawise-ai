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
    description: "Compare activity times and locations",
    icon: "calendar",
  },
  {
    href: "/reports",
    label: "Civic reports",
    description: "Submit and track pollution incidents",
    icon: "flag",
  },
  {
    href: "/insights",
    label: "City insights",
    description: "Trends and hotspots",
    icon: "chart",
  },
];

export const secondaryNavigation: readonly NavItem[] = [
  {
    href: "/settings",
    label: "Settings",
    description: "Profile, language and preferences",
    icon: "sliders",
  },
];

/** True when `pathname` is the item's route or one of its child routes. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
