import { expect, test } from "@playwright/test";

/** 1×1 JPEG. Both report APIs are mocked, so nothing is stored and Gemini is never called. */
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

const analysis = {
  imageUsable: true,
  imageIssue: "none",
  pollutionVisible: true,
  category: "construction_dust",
  confidence: 0.82,
  visibleSeverity: "moderate",
  observations: ["Dust rising from an uncovered pile of sand at a building site"],
  recommendations: ["Cover loose construction material"],
  limitations: ["A photo cannot measure air quality: no AQI or pollutant concentration is inferred from it."],
  peopleVisible: false,
  licencePlatesReadable: false,
  canSubmit: true,
  model: "mock",
  promptVersion: "photo-analysis/v1",
  analysedAt: "2026-11-25T10:00:00.000Z",
};

test.describe("Civic reporter (APIs mocked)", () => {
  test("photo → AI analysis → confirm → submit", async ({ page }) => {
    let submitted: string | null = null;
    await page.route("**/api/reports/analyze", (route) => route.fulfill({ json: { analysis, token: "1999999999999.mock" } }));
    await page.route("**/api/reports", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      submitted = route.request().postData();
      await route.fulfill({ status: 201, json: { id: "00000000-0000-4000-8000-000000000000" } });
    });

    await page.goto("/reports/new");
    test.skip(await page.getByText("Reporting is not configured").isVisible(), "Reporting not configured");
    await expect(page.locator('input[type="file"]')).toBeEnabled();
    await page.locator('input[type="file"]').setInputFiles({ name: "dust.jpg", mimeType: "image/jpeg", buffer: TINY_JPEG });
    await page.getByRole("button", { name: "Analyse with AI" }).click();

    await expect(page.getByText("Dust rising from an uncovered pile of sand")).toBeVisible();
    await expect(page.getByText(/82%/)).toBeVisible();
    await expect(page.getByText(/not calibrated/)).toBeVisible();
    await expect(page.getByRole("radio", { name: /Construction dust/ })).toBeChecked();

    const submit = page.getByRole("button", { name: "Submit report" });
    await expect(submit).toBeDisabled();
    await page.getByLabel("Or choose an area").selectOption({ index: 1 });
    await expect(page.getByText(/rounded to about 110 m/)).toBeVisible();
    await page.getByRole("checkbox").check();
    await submit.click();

    await expect(page.getByRole("heading", { name: "Report submitted" })).toBeVisible();
    await expect(page.getByRole("link", { name: "View on the map" })).toHaveAttribute("href", /\/map\?report=/);
    expect(submitted).toContain('name="token"');
    expect(submitted).toContain("construction_dust");
  });

  test("an unusable photo cannot be submitted", async ({ page }) => {
    await page.route("**/api/reports/analyze", (route) =>
      route.fulfill({ json: { analysis: { ...analysis, imageUsable: false, imageIssue: "screenshot_or_artwork", canSubmit: false, category: "none_visible" }, token: "1999999999999.mock" } }),
    );
    await page.goto("/reports/new");
    test.skip(await page.getByText("Reporting is not configured").isVisible(), "Reporting not configured");
    await expect(page.locator('input[type="file"]')).toBeEnabled();
    await page.locator('input[type="file"]').setInputFiles({ name: "x.jpg", mimeType: "image/jpeg", buffer: TINY_JPEG });
    await page.getByRole("button", { name: "Analyse with AI" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "can't be used for a report" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit report" })).toHaveCount(0);
  });

  test("shows an honest error when analysis is unavailable", async ({ page }) => {
    await page.route("**/api/reports/analyze", (route) =>
      route.fulfill({ status: 503, json: { error: { code: "ai_unavailable", message: "The AI is busy right now. Please try again in a minute." } } }),
    );
    await page.goto("/reports/new");
    test.skip(await page.getByText("Reporting is not configured").isVisible(), "Reporting not configured");
    await expect(page.locator('input[type="file"]')).toBeEnabled();
    await page.locator('input[type="file"]').setInputFiles({ name: "x.jpg", mimeType: "image/jpeg", buffer: TINY_JPEG });
    await page.getByRole("button", { name: "Analyse with AI" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "The AI is busy" })).toBeVisible();
  });
});

test.describe("Civic report APIs (validation only, nothing stored)", () => {
  test("analysis rejects non-JPEG and missing photos before calling the model", async ({ request }) => {
    const png = await request.post("/api/reports/analyze", {
      multipart: { photo: { name: "x.png", mimeType: "image/png", buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) } },
    });
    expect([400, 503]).toContain(png.status());
    const empty = await request.post("/api/reports/analyze", { multipart: { note: "no photo" } });
    expect([400, 503]).toContain(empty.status());
  });

  test("submission rejects a forged token", async ({ request }) => {
    const response = await request.post("/api/reports", {
      multipart: {
        photo: { name: "x.jpg", mimeType: "image/jpeg", buffer: TINY_JPEG },
        category: "construction_dust",
        latitude: "26.912",
        longitude: "75.787",
        consent: "yes",
        analysis: JSON.stringify(analysis),
        token: "1999999999999.forged-signature",
      },
    });
    expect([400, 503]).toContain(response.status());
    if (response.status() === 400) expect((await response.json()).error.code).toBe("analysis_mismatch");
  });
});

test("reports page lists reports or an honest empty state", async ({ page }) => {
  await page.goto("/reports");
  await expect(page.getByRole("heading", { level: 1, name: "Civic reports" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent reports" }).or(page.getByRole("heading", { name: "No reports yet" }))).toBeVisible();
});
