import { expect, test, type Page } from "@playwright/test";

const routes = [
  { path: "/", heading: "Air-quality intelligence you can trace to its source." },
  { path: "/dashboard", heading: "Air dashboard" },
  { path: "/map", heading: "Pollution map" },
  { path: "/guardian", heading: "Air Guardian" },
  { path: "/planner", heading: "Exposure planner" },
  { path: "/reports", heading: "Civic reports" },
  { path: "/reports/new", heading: "Report pollution" },
  { path: "/insights", heading: "City insights" },
  { path: "/settings", heading: "Settings" },
];

/** Fails the test if the page scrolls horizontally at the current viewport. */
async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, "page should not scroll horizontally").toBeLessThanOrEqual(0);
}

for (const route of routes) {
  test(`renders ${route.path} without errors or horizontal overflow`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    const response = await page.goto(route.path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });
}

test("landing call to action opens the dashboard", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("main").getByRole("link", { name: "Open dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: "Air dashboard" })).toBeVisible();
});

test.describe("dashboard", () => {
  test("labels provenance and discloses the calculated AQI", async ({ page }) => {
    await page.goto("/dashboard?location=mansarovar");
    await expect(page.getByRole("heading", { name: "Current AQI" })).toBeVisible();
    // Either a measured AQI with its disclosure, or an explicit unavailable state.
    const disclosure = page.getByText("Calculated by Hawa AI from station measurements");
    const unavailable = page.getByText(/AQI not available|No station measurement available/);
    await expect(disclosure.or(unavailable).first()).toBeVisible();
    await expect(page.getByText("Model estimate", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sources and freshness" })).toBeVisible();
  });

  test("area selector switches the area", async ({ page }) => {
    await page.goto("/dashboard");
    const selector = page.getByRole("combobox", { name: "Area" });
    await selector.selectOption("sitapura");
    // Selecting alone must not navigate (WCAG 3.2.2); the Show button does.
    await expect(page).not.toHaveURL(/location=sitapura/);
    await page.getByRole("button", { name: "Show" }).click();
    await expect(page).toHaveURL(/location=sitapura/);
    await expect(selector).toHaveValue("sitapura");
    await expect(page.getByText("Open-Meteo, for Sitapura")).toBeVisible();
  });

  test("unknown areas show the not-found page and are not indexed", async ({ page }) => {
    // The page shell streams before the area is checked, so the HTTP status
    // stays 200; the not-found UI and a noindex directive are what matter.
    await page.goto("/dashboard?location=atlantis");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).not.toHaveCount(0);
  });

  test("hourly chart offers a data table and keyboard reading", async ({ page }) => {
    await page.goto("/dashboard?location=mansarovar");
    await expect(page.getByRole("heading", { name: "Hourly trend" })).toBeVisible();
    const chart = page.getByRole("group", { name: /Hourly PM2.5 and PM10/ });
    test.skip((await chart.count()) === 0, "No hourly data stored yet");
    await chart.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByText(/^Hour ending/).first()).toBeVisible();
    await page.getByText("Show data table").click();
    await expect(page.getByRole("columnheader", { name: "PM2.5 (µg/m³)" })).toBeVisible();
  });
});

test("primary navigation marks the current page", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Sidebar is visible on desktop only");
  await page.goto("/reports/new");
  const link = page.getByRole("navigation", { name: "Primary" }).getByRole("link", {
    name: "Civic reports",
  });
  await expect(link).toHaveAttribute("aria-current", "page");
});

test("navigation drawer opens, navigates and closes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop", "Drawer is used below the desktop breakpoint");
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Open navigation" }).click();
  const drawer = page.getByRole("dialog", { name: "Navigation" });
  await expect(drawer).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();

  await page.getByRole("button", { name: "Open navigation" }).click();
  await drawer.getByRole("link", { name: "Pollution map" }).click();
  await expect(page).toHaveURL(/\/map$/);
  await expect(drawer).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "Pollution map" })).toBeVisible();
});

test("unknown routes show the not-found page", async ({ page }) => {
  const response = await page.goto("/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

test.describe("API", () => {
  test("health endpoint reports ok without caching", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    const body = await response.json();
    expect(body).toMatchObject({ status: "ok", service: "hawawise-ai" });
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  test("reports and chat endpoints validate and expose only public data", async ({ request }) => {
    // /api/reports is implemented (Day 4): public columns only.
    const reports = await request.get("/api/reports");
    expect(reports.status()).toBe(200);
    for (const report of (await reports.json()).reports) {
      expect(Object.keys(report).sort()).toEqual(
        ["aiCategory", "aiConfidence", "createdAt", "category", "id", "latitude", "longitude", "status", "verificationStatus", "visibleSeverity"].sort(),
      );
    }
    // /api/ai/chat is implemented (Day 2); an empty body is rejected by validation.
    const chat = await request.post("/api/ai/chat", { data: {} });
    expect(chat.status()).toBe(400);
  });

  test("air-quality API validates input and labels provenance", async ({ request }) => {
    expect((await request.get("/api/air-quality?location=NOT%20VALID")).status()).toBe(400);
    expect((await request.get("/api/air-quality?location=does-not-exist")).status()).toBe(404);

    const response = await request.get("/api/air-quality?location=jaipur-city-centre");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.location.slug).toBe("jaipur-city-centre");
    expect(Array.isArray(body.unavailable)).toBe(true);
    if (body.measured) {
      expect(body.measured.provenance).toBe("measured");
      expect(body.measured.observedAt).toBeTruthy();
      expect(body.measured.fetchedAt).toBeTruthy();
      if (body.measured.aqi) {
        expect(body.measured.aqi.scale).toBe("ind_cpcb");
        expect(body.measured.aqi.origin).toBe("hawa_calculated");
      }
    }
    if (body.modelled) expect(body.modelled.provenance).toBe("modelled");
  });

  test("forecast API returns future hours only", async ({ request }) => {
    expect((await request.get("/api/forecast?location=mansarovar&hours=999")).status()).toBe(400);
    const response = await request.get("/api/forecast?location=mansarovar&hours=24");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.provenance).toBe("forecast");
    for (const hour of body.hours) {
      expect(Date.parse(hour.forecastFor)).toBeGreaterThan(Date.now() - 60_000);
    }
  });

  test("ingestion endpoint rejects requests without the cron secret", async ({ request }) => {
    expect((await request.get("/api/cron/ingest")).status()).toBe(401);
    const wrong = await request.get("/api/cron/ingest", {
      headers: { Authorization: "Bearer not-the-secret" },
    });
    expect(wrong.status()).toBe(401);
  });

  test("responses include baseline security headers", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-powered-by"]).toBeUndefined();
  });
});
