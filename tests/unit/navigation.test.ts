import { describe, expect, it } from "vitest";

import {
  isNavItemActive,
  primaryNavigation,
  secondaryNavigation,
} from "@/config/navigation";

describe("navigation", () => {
  it("has unique, absolute routes", () => {
    const hrefs = [...primaryNavigation, ...secondaryNavigation].map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) expect(href.startsWith("/")).toBe(true);
  });

  it("marks parent routes active for child routes only", () => {
    expect(isNavItemActive("/reports", "/reports")).toBe(true);
    expect(isNavItemActive("/reports/new", "/reports")).toBe(true);
    expect(isNavItemActive("/reportsarchive", "/reports")).toBe(false);
    expect(isNavItemActive("/dashboard", "/reports")).toBe(false);
  });
});
