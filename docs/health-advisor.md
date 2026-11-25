# Health advisor

`/advisor` turns the latest **measured** AQI into practical exposure-reduction steps for a chosen group and activity. **The advice comes from official public-health guidance through a deterministic rules engine.** Gemini can explain it in English or Hindi but cannot change, add to or override it.

This is general environmental health information, not individual medical advice. Nothing is stored, and no medical details are asked for.

## Sources (checked 25 Nov 2026)

| Source | Used for |
| --- | --- |
| [MoHFW / NCDC — Health Advisory on Air Pollution under NPCCHH](https://ncdc.mohfw.gov.in/uploads/pdf/Air%20Pollution%20advisory%20and%20letter%20by%20Sec%20Health-2024.pdf). Enclosed with the Health Secretary's letter of 18 Nov 2024. | Covers three things:<br>• The table "AQI levels, Health effects and Certain Protective Health Measures" (p. 7), quoted **verbatim** for each category, for the general and vulnerable populations.<br>• The definition of vulnerable groups: children, older people, pregnant women, people with respiratory, heart or cerebrovascular conditions, and outdoor workers.<br>• The public IEC and social-media messages: timing, routes, windows, vehicles, indoor sources, an optional N95/N99 mask, and when to consult a doctor. |
| [CPCB National AQI](https://app.cpcbccr.com/AQIIndia) | Categories and breakpoints (already used by Hawa AI's AQI calculation). |
| [WHO — Personal interventions and risk communication (Q&A, 2024)](https://www.who.int/news-room/questions-and-answers/item/air-pollution-personal-interventions-and-risk-communication) | Respirator caveats: fit, no products for children known as of 2019, caution for heart or lung disease. |

**Deliberately left out**, because the feature must not give treatment instructions:
- The advisory's line about keeping prescribed medicines available. People with conditions are told instead to follow their doctor's instructions and seek advice if symptoms worsen.
- The diet and gargling tips.

## Rules engine (`src/features/health-advisor/rules.ts`)

- **Inputs:**
  - Profile: general, child, older adult, pregnant, respiratory or asthma, heart condition, outdoor worker, or prefer not to specify.
  - Activity: walking, running, cycling, outdoor exercise, commuting, general outdoor, or indoor.
  - The latest measured CPCB AQI with its category, dominant pollutant, station, time and staleness.
  - An optional forecast hint.
- **Group:**
  - Every profile except general and unspecified is "vulnerable", as defined by MoHFW.
  - "Prefer not to specify" gets the general advice, with the vulnerable-group line shown as well.
- **Official line:** the table row for the category and group is shown verbatim. Its restriction tier (0–5) selects the supporting official messages and the activity verdict (go, adjust, limit, avoid, indoors).
- **Above AQI 200:** the advisory's "poor to severe plus (AQI > 200)" messages apply.
- **Item sources:** every item carries its source, either MoHFW, WHO or "Hawa AI". The Hawa AI items are data notes (freshness, forecast window, recheck timing) and the emergency numbers (112, 108).
- **Stale reading:** the advice is shown with a warning.
- **No measured reading:** only general precautions are shown, with no category. **Model estimates are never used to set a health category.**
- **Forecast hint:** reuses the exposure planner's ranking, giving the comparatively lower daytime window today, or tomorrow if none is left today. It is labelled as a modelled forecast.

## AI explanation

`POST /api/advisor/explain {location, profile, activity, language}` rebuilds the advisory on the server and makes one Gemini call through the shared `generateGroundedExplanation`.

- **Grounding:** every AQI or concentration figure must match the data.
- **Language:** the reply must be in the requested language.
- **Medical safety check** (`safety.ts`), applied in English and Hindi. It rejects:
  - Mentions of medicines, inhalers, doses or prescriptions.
  - Diagnosis phrasing.
  - Any claim that something is "safe" or "risk-free".
- **On failure:** a rejected answer gets one correction, and after that the page states that no explanation is shown.
- **Prompt:** `advisor-explain/v1`.
- **Limits:** the same rate limits and 30-minute cache as the other explanation endpoints.

## Where it appears

- **`/advisor`:** profile and activity selector, advisory, official quote, actions, things to avoid, home measures, when to check again, symptoms, lower-exposure times, sources, disclaimer and AI explanation.
- **Dashboard:** a "Health advisor" section ("What should I do based on these conditions?"), next to the AI daily brief ("What is happening with Jaipur's air today?"), with one-tap profile links.
- **Links** from Air Guardian, the exposure planner and the guided demo.

## Measured on 25 Nov 2026

Tested locally with live data: Mansarovar, AQI 242 Poor, profile "Respiratory sensitivity / asthma", activity running.

- **Verdict:** "better avoided outdoors right now", quoting "Avoid outdoor physical activities".
- **Hindi explanation:** 14 s. **English explanation:** 4 s.
- **Content:** both quoted the official line and included the symptom guidance and the 112 and 108 numbers. Neither mentioned medicines.
- **Failures seen:** two English attempts failed during a Gemini capacity spike (503 and timeouts) and were reported honestly. One English answer was rejected because the grounding check misread the time in "AQI … at 5:00 pm" as a figure. That bug is fixed: times, dates and pollutant names are now ignored by the grounding check.

## Tests

- **Unit tests** (`tests/unit/health-advisor.test.ts`) cover:
  - Every category for both groups, quoted verbatim, with monotonic tiers.
  - Every profile, and the profile-specific messages.
  - Activity verdicts.
  - Stale and missing readings, and modelled-versus-measured data.
  - Forecast available or unavailable.
  - A sweep across every category × profile × activity showing no generated text breaks the safety rules.
  - The safety rules themselves, in English and Hindi.
  - The mocked AI flow: Hindi, rejected medication advice, fabricated figures, and Gemini failure.
- **End-to-end tests** (`tests/e2e/advisor.spec.ts`) cover:
  - The page, disclaimer and sources.
  - The URL updating when the profile changes, and defaults for edited values.
  - A mocked Hindi explanation and its failure state.
  - API validation.
  - The dashboard sections and the Guardian link.
