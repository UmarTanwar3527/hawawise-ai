import { describe, expect, it } from "vitest";

import {
  CPCB_AQI_CATEGORIES,
  CPCB_AQI_MAX,
  getCpcbAqiCategory,
} from "@/features/air-quality/cpcb-aqi-scale";

describe("CPCB AQI scale", () => {
  it.each([
    [0, "good"],
    [50, "good"],
    [51, "satisfactory"],
    [100, "satisfactory"],
    [101, "moderate"],
    [200, "moderate"],
    [201, "poor"],
    [300, "poor"],
    [301, "very_poor"],
    [400, "very_poor"],
    [401, "severe"],
    [500, "severe"],
  ])("maps AQI %d to %s", (aqi, expected) => {
    expect(getCpcbAqiCategory(aqi)?.id).toBe(expected);
  });

  it("places fractional values above a band's upper bound in the next band", () => {
    expect(getCpcbAqiCategory(50.4)?.id).toBe("satisfactory");
  });

  it("keeps values above the scale maximum as severe", () => {
    expect(getCpcbAqiCategory(650)?.id).toBe("severe");
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "returns null for invalid value %s",
    (aqi) => {
      expect(getCpcbAqiCategory(aqi)).toBeNull();
    },
  );

  it("defines contiguous, non-overlapping bands from 0 to the maximum", () => {
    expect(CPCB_AQI_CATEGORIES[0]?.min).toBe(0);
    expect(CPCB_AQI_CATEGORIES.at(-1)?.max).toBe(CPCB_AQI_MAX);
    for (let i = 1; i < CPCB_AQI_CATEGORIES.length; i += 1) {
      const previous = CPCB_AQI_CATEGORIES[i - 1];
      const current = CPCB_AQI_CATEGORIES[i];
      expect(current?.min).toBe((previous?.max ?? Number.NaN) + 1);
    }
  });
});
