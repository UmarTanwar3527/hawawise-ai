import { expect, test } from "@playwright/test";

test.describe("Health advisor", () => {
  test("shows official guidance for the chosen profile, with sources and a disclaimer", async ({ page }) => {
    await page.goto("/advisor?location=mansarovar&profile=respiratory&activity=running");
    await expect(page.getByRole("heading", { level: 1, name: "Health advisor" })).toBeVisible();
    await expect(page.getByText(/not individual medical advice/)).toBeVisible();
    await expect(page.getByText(/call 112 or 108/).first()).toBeVisible();
    await expect(page.getByRole("radio", { name: "Respiratory sensitivity / asthma" })).toBeChecked();
    await expect(page.getByRole("heading", { name: "Your advisory" })).toBeVisible();
    const official = page.getByText("Official guidance", { exact: true });
    const noReading = page.getByText("No current reading");
    await expect(official.or(noReading).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /MoHFW \/ NCDC/ }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "If you feel unwell" })).toBeVisible();
  });

  test("changing the profile updates the shareable URL", async ({ page }) => {
    await page.goto("/advisor");
    await page.getByText("Pregnant person", { exact: true }).click();
    await page.getByText("Commuting", { exact: true }).click();
    await page.getByRole("button", { name: /Get advice/ }).click();
    await expect(page).toHaveURL(/profile=pregnant/);
    await expect(page).toHaveURL(/activity=commuting/);
  });

  test("hand-edited values fall back to safe defaults", async ({ page }) => {
    await page.goto("/advisor?profile=astronaut&activity=skydiving");
    await expect(page.getByRole("radio", { name: "Prefer not to specify" })).toBeChecked();
    await expect(page.getByRole("radio", { name: "General outdoor activity" })).toBeChecked();
  });

  test("AI explanation in Hindi (API mocked) and honest failure", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/advisor/explain", async (route) => {
      calls += 1;
      expect(route.request().postDataJSON()).toMatchObject({ profile: "child" });
      return calls === 1
        ? route.fulfill({ json: { status: "ok", explanation: "आधिकारिक सलाह का पालन करें।", language: "hi", promptVersion: "advisor-explain/v1" } })
        : route.fulfill({ status: 503, json: { error: { code: "ai_unavailable", message: "The AI is busy right now. The advice above is still valid." } } });
    });
    await page.goto("/advisor?profile=child");
    const hindi = page.getByRole("button", { name: "हिंदी में समझाएँ" });
    await hindi.waitFor({ timeout: 15_000 }).catch(() => {});
    test.skip(!(await hindi.isVisible()), "AI not configured");
    await hindi.click();
    await expect(page.getByText("आधिकारिक सलाह का पालन करें।")).toBeVisible();
    await page.getByRole("button", { name: "Explain in English" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "The AI is busy" })).toBeVisible();
  });

  test("explain API validates input before calling the model", async ({ request }) => {
    expect((await request.post("/api/advisor/explain", { data: { profile: "child" } })).status()).toBe(400);
    expect((await request.post("/api/advisor/explain", { data: { location: "jaipur-city-centre", profile: "doctor", activity: "walking", language: "en" } })).status()).toBe(400);
  });

  test("dashboard shows the daily brief and the health advisor as separate sections", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "AI daily air brief" })).toBeVisible();
    await expect(page.getByText(/What is happening with Jaipur's air today\?/)).toBeVisible();
    const advisor = page.getByRole("heading", { name: "Health advisor" });
    test.skip(!(await advisor.isVisible()), "Dashboard data unavailable");
    await expect(page.getByText(/What should I do based on these conditions\?/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Pregnant person" })).toHaveAttribute("href", /\/advisor\?.*profile=pregnant/);
  });

  test("Air Guardian links to the advisor", async ({ page }) => {
    await page.goto("/guardian");
    await expect(page.getByRole("main").getByRole("link", { name: "Health advisor" })).toHaveAttribute("href", "/advisor");
  });
});
