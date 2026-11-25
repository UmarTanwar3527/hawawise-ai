import { expect, test } from "@playwright/test";

test.describe("City insights", () => {
  test("shows calculated statistics with provenance, charts with tables, and the method", async ({ page }) => {
    await page.goto("/insights");
    await expect(page.getByRole("heading", { level: 1, name: "City insights" })).toBeVisible();
    test.skip(await page.getByText("Not enough history yet").isVisible(), "No stored history");

    await expect(page.getByRole("heading", { name: "Daily city levels" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Daily rhythm" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Station comparison" })).toBeVisible();
    await expect(page.getByText("Measured", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Data coverage \d+%/)).toBeVisible();

    await page.getByText("Show data table").first().click();
    await expect(page.getByRole("columnheader", { name: "Highest station AQI" })).toBeVisible();
    await page.getByText("How these insights are calculated").click();
    await expect(page.getByText(/Today is excluded because it is incomplete/)).toBeVisible();
  });

  test("AI interpretation (API mocked) and its honest failure state", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/insights/explain", (route) => {
      calls += 1;
      return calls === 1
        ? route.fulfill({ json: { status: "ok", explanation: "PM2.5 peaks in the evening.", language: "en", promptVersion: "insights-explain/v1" } })
        : route.fulfill({ status: 503, json: { error: { code: "ai_unavailable", message: "The AI is busy right now. The statistics above are still valid." } } });
    });
    await page.goto("/insights");
    const button = page.getByRole("button", { name: "Explain in English" });
    await button.waitFor({ timeout: 15_000 }).catch(() => {});
    test.skip(!(await button.isVisible()), "AI interpretation not available");
    await button.click();
    await expect(page.getByText("PM2.5 peaks in the evening.")).toBeVisible();
    await page.getByRole("button", { name: "हिंदी में समझाएँ" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "The AI is busy" })).toBeVisible();
  });

  test("explain API validates input before calling the model", async ({ request }) => {
    expect((await request.post("/api/insights/explain", { data: { language: "fr" } })).status()).toBe(400);
    expect((await request.post("/api/insights/explain", { data: "nope", headers: { "content-type": "text/plain" } })).status()).toBe(400);
  });
});
