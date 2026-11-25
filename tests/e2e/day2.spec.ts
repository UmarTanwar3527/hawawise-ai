import { expect, test } from "@playwright/test";

const groundedAnswer = {
  answer: "Jaipur's calculated CPCB AQI is **140** (Moderate).\n\n- PM2.5: 54.5 µg/m³",
  language: "en",
  summary: "Moderate air in central Jaipur.",
  recommendations: ["Sensitive groups should limit long outdoor exertion."],
  warnings: ["AQI is calculated by Hawa AI, not an official CPCB bulletin value."],
  evidence: [
    {
      source: "OpenAQ — CPCB/RSPCB continuous monitoring station",
      station: "Police Commissionerate, Jaipur - RSPCB",
      observedAt: "2026-11-25T06:30:00Z",
      fetchedAt: "2026-11-25T09:25:00Z",
      dataKind: "measured",
      aqiStandard: "India National AQI (CPCB), calculated by Hawa AI from station measurements",
      url: null,
    },
  ],
  toolCalls: [{ name: "get_current_air_quality", label: "Retrieved current air quality for Jaipur city centre", ok: true }],
  grounded: true,
  promptVersion: "air-guardian/v1",
  signature: "sig",
};

test.describe("Air Guardian UI (API mocked)", () => {
  test("shows a grounded answer with genuine tool activity and evidence", async ({ page }) => {
    await page.route("**/api/ai/chat", (route) => route.fulfill({ json: groundedAnswer }));
    await page.goto("/guardian");
    test.skip(await page.getByText("Air Guardian is not configured").isVisible(), "Gemini not configured");

    await page.getByRole("button", { name: "What is the current air quality in Jaipur?" }).click();
    await expect(page.getByText("Retrieved current air quality for Jaipur city centre")).toBeVisible();
    await expect(page.getByRole("log").getByText("140", { exact: true })).toBeVisible();
    await expect(page.getByText("Sensitive groups should limit long outdoor exertion.")).toBeVisible();
    await page.getByText("Sources and evidence (1)").click();
    await expect(page.getByText("Police Commissionerate, Jaipur - RSPCB")).toBeVisible();
    await expect(page.getByText("Measured", { exact: true })).toBeVisible();
  });

  test("shows an honest error when the AI is unavailable", async ({ page }) => {
    await page.route("**/api/ai/chat", (route) =>
      route.fulfill({ status: 503, json: { error: { code: "ai_unavailable", message: "Air Guardian is busy right now. Please try again in a minute." } } }),
    );
    await page.goto("/guardian");
    test.skip(await page.getByText("Air Guardian is not configured").isVisible(), "Gemini not configured");
    await page.getByLabel("Ask Air Guardian").fill("AQI?");
    await page.getByRole("button", { name: /Ask/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Air Guardian is busy" })).toBeVisible();
  });
});

test.describe("Air Guardian API", () => {
  test("validates input before calling the model", async ({ request }) => {
    expect((await request.post("/api/ai/chat", { data: { message: "" } })).status()).toBe(400);
    expect((await request.post("/api/ai/chat", { data: { message: "x".repeat(1001) } })).status()).toBe(400);
    expect((await request.post("/api/ai/chat", { data: "not json", headers: { "content-type": "text/plain" } })).status()).toBe(400);
  });

  test("brief endpoint requires the cron secret", async ({ request }) => {
    expect((await request.get("/api/cron/brief")).status()).toBe(401);
  });
});

test.describe("Pollution map", () => {
  test("renders stations and shows details for a selected station", async ({ page }) => {
    await page.goto("/map");
    await expect(page.getByRole("heading", { level: 1, name: "Pollution map" })).toBeVisible();
    const stationButtons = page.getByRole("table").first().getByRole("button");
    test.skip((await stationButtons.count()) === 0, "No stations stored");
    await stationButtons.first().click();
    await expect(page.getByRole("heading", { name: "Monitoring station", exact: true })).toBeVisible();
    await expect(page.getByText(/AQI calculated by Hawa AI from this station/)).toBeVisible();
  });
});

test.describe("Dashboard daily brief", () => {
  test("shows either a labelled AI brief or an honest empty state", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "AI daily air brief" })).toBeVisible();
    const labelled = page.getByText("AI-generated summary based on available environmental data.");
    const empty = page.getByText("No AI summary available yet");
    await expect(labelled.or(empty).first()).toBeVisible();
  });
});
