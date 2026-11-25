import { expect, test } from "@playwright/test";

test.describe("Guided demo and polish", () => {
  test("demo page shows live readiness checks and every scene links to a real page", async ({ page }) => {
    await page.goto("/demo");
    await expect(page.getByRole("heading", { level: 1, name: "Guided demo" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Demo readiness" })).toBeVisible();
    await expect(page.getByText("No provider or AI calls are made.")).toBeVisible();
    for (const label of ["Station measurements", "Forecast", "AI daily brief", "History for City insights", "AI (Gemini)", "Photo reporting"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: /Closing/ })).toBeVisible();
    const hrefs = await page.locator("main ol a").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(hrefs).toEqual(expect.arrayContaining(["/dashboard", "/reports/new", "/insights"]));
  });

  test("the Guardian link pre-fills the question without sending it", async ({ page }) => {
    let sent = false;
    await page.route("**/api/ai/chat", (route) => {
      sent = true;
      return route.abort();
    });
    await page.goto("/demo");
    await page.getByRole("link", { name: /Ask Air Guardian/ }).click();
    await expect(page).toHaveURL(/\/guardian\?q=/);
    test.skip(await page.getByText("Air Guardian is not configured").isVisible(), "Gemini not configured");
    await expect(page.getByLabel("Ask Air Guardian")).toHaveValue(/Why is Jaipur's air quality like this today/);
    await page.waitForTimeout(500);
    expect(sent).toBe(false);
  });

  test("landing shows a live, labelled reading or an honest fallback", async ({ page }) => {
    await page.goto("/");
    const live = page.getByText("Latest station reading");
    const fallback = page.getByText("The latest reading could not be loaded here.");
    await expect(live.or(fallback)).toBeVisible();
    if (await live.isVisible()) await expect(page.getByText(/calculated by Hawa AI/).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Five questions, answered with evidence" })).toBeVisible();
  });

  test("dashboard links onward with the selected area", async ({ page }) => {
    await page.goto("/dashboard?location=mansarovar");
    const steps = page.getByRole("navigation", { name: "Act on this reading" });
    test.skip(!(await steps.isVisible()), "Dashboard data unavailable");
    await expect(steps.getByRole("link", { name: /Plan outdoor time/ })).toHaveAttribute("href", "/planner?location=mansarovar");
    await expect(steps.getByRole("link", { name: /Ask Air Guardian/ })).toHaveAttribute("href", /Mansarovar/);
  });
});
