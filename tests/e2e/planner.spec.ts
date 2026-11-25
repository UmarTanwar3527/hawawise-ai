import { expect, test } from "@playwright/test";

const PLAN = "/planner?location=mansarovar&activity=running&duration=45&day=tomorrow&from=5&to=22";

test.describe("Exposure planner", () => {
  test("compares forecast windows with labelled provenance and an honest caveat", async ({ page }) => {
    await page.goto(PLAN);
    await expect(page.getByRole("heading", { level: 1, name: "Exposure planner" })).toBeVisible();
    const empty = page.getByRole("heading", { name: "No forecast stored for this area" });
    test.skip(await empty.isVisible(), "No forecast stored");

    await expect(page.getByRole("heading", { name: "Forecast comparison" })).toBeVisible();
    await expect(page.getByText("Forecast", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Modelled", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/is not the same as safe/)).toBeVisible();
    await expect(page.getByRole("radio", { name: "Running" })).toBeChecked();
    await page.getByText("Show data table").click();
    await expect(page.getByRole("table").getByText("Lowest window").first()).toBeVisible();
  });

  test("form choices become a shareable URL", async ({ page }) => {
    await page.goto(PLAN);
    await page.getByText("Cycling", { exact: true }).click();
    await page.getByLabel("Duration").selectOption("90");
    await page.getByRole("button", { name: /Compare times/ }).click();
    await expect(page).toHaveURL(/activity=cycling/);
    await expect(page).toHaveURL(/duration=90/);
  });

  test("falls back to defaults for hand-edited values and 404s unknown areas", async ({ page }) => {
    await page.goto("/planner?activity=skydiving&duration=7");
    await expect(page.getByRole("radio", { name: "Walking" })).toBeChecked();
    // Streams like the dashboard: not-found UI plus noindex, HTTP status stays 200.
    await page.goto("/planner?location=atlantis");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).not.toHaveCount(0);
  });

  test("shows the AI explanation in Hindi (API mocked)", async ({ page }) => {
    await page.route("**/api/planner/explain", async (route) => {
      expect(route.request().postDataJSON()).toMatchObject({ location: "mansarovar", activity: "running", language: "hi" });
      await route.fulfill({ json: { status: "ok", explanation: "दोपहर का समय तुलनात्मक रूप से बेहतर है।", language: "hi", promptVersion: "planner-explain/v1" } });
    });
    await page.goto(PLAN);
    const button = page.getByRole("button", { name: "हिंदी में समझाएँ" });
    test.skip(!(await button.isVisible()), "AI explanation not available");
    await button.click();
    await expect(page.getByText("दोपहर का समय तुलनात्मक रूप से बेहतर है।")).toBeVisible();
  });

  test("explain API validates input before calling the model", async ({ request }) => {
    expect((await request.post("/api/planner/explain", { data: { location: "mansarovar" } })).status()).toBe(400);
    expect((await request.post("/api/planner/explain", { data: "nope", headers: { "content-type": "text/plain" } })).status()).toBe(400);
  });
});
