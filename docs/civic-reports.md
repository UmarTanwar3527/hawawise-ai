# AI civic pollution reporter (Day 4)

Anyone can photograph a visible pollution source in Jaipur. Gemini describes what the photo shows; the person confirms the category, pins the location and submits. **No account is needed.** Reports are community submissions, not official complaints, and a photo is never used to infer AQI.

## Flow

```text
/reports/new (browser)
  choose/take photo ─► re-encode on a canvas to JPEG ≤1600 px   (drops EXIF incl. GPS; converts HEIC)
  POST /api/reports/analyze  {photo}
     JPEG only (magic bytes) ─► strip metadata again ─► sha256
     rate limit ─► Gemini vision, submit_photo_analysis (schema-validated)
     reject any AQI / concentration claims (one correction, else 502)
     add fixed limitations ─► { analysis, token = HMAC(sha256 | expiry | analysis) }
  confirm category ─► pin location (map tap, device location or area list) ─► consent
  POST /api/reports  {photo, analysis, token, category, lat, lon, description, consent}
     validate (Zod, Jaipur bounds, no links) ─► verify token against these photo bytes
     duplicate photo? (sha256) ─► insert row (DB quota trigger) ─► upload private photo ─► media row
     any failure removes what was written ─► revalidate the reports cache
  /map?report=<id> shows it as an unverified community report
```

## What is public and what is private

| Public (map, `/reports`, `GET /api/reports`) | Private (server and service role only) |
| --- | --- |
| Category (person-confirmed) | Photo (private bucket `report-media/anonymous/<id>/photo.jpg`) |
| AI category, AI confidence, visible intensity | Description |
| Location rounded to 3 decimals (about 110 m) | AI observations, recommendations, people and number-plate flags |
| Status, verification status, time | Submitter hash (cleared after 48 hours) |

This is enforced by **column grants** plus an RLS policy for `anon` (`status <> 'rejected'`, `verification_status <> 'dismissed'`), and tested in pgTAP.

## AI analysis rules (`prompts/photo-analysis.v1.ts`, `services/analyse-photo.ts`)

- **Categories:** construction dust, waste burning, smoke (source unclear), industrial emissions, road dust, vehicle exhaust, other, or none visible.
- **Confidence** is the model's own estimate. The UI labels it "not calibrated".
- **Visible intensity** (low, moderate, high or unclear) describes only how much smoke or dust is visible. It is not an AQI.
- **No numbers:** if any text gives an AQI or concentration, the server rejects it, asks once for a correction, and fails after that.
- **Unusable photos** are marked not submittable: screenshots, artwork, documents, dark or blurry images, inappropriate content, or no outdoor scene.
- **Fixed limitations** are always shown:
  - A photo cannot measure air quality.
  - The location and source have not been verified.
- **No identification or blame:** the model must not identify people, read out number plates, or name or blame anyone.
- **Prompt injection:** text inside an image is treated as data, not instructions.

## Abuse and privacy controls

- **In memory, per instance:**
  - Analysis: 6 per 10 minutes and 20 per day per IP, plus 400 per day per instance.
  - Submission: 3 per hour and 10 per day per IP.
- **In the database (across instances):** 3 per hour and 10 per day per submitter hash, and 300 anonymous reports per day in total.
- **Photos:**
  - At most 3 MB, and JPEG only, checked from the bytes.
  - Metadata is stripped twice. The server keeps JFIF, ICC and Adobe colour segments only.
  - Duplicate photos are rejected using a SHA-256 hash.
- **Submitter hash:** an HMAC of the client IP using a key derived from the service-role key. It's used only for rate limits and cleared after 48 hours.
- **Descriptions:**
  - At most 500 characters. Links are rejected and control characters removed.
  - Never published.
- **Moderation:** reports can be hidden by setting `verification_status = 'dismissed'` or `status = 'rejected'` (service role). There is no moderation UI yet.

## Verified on 2026-11-25 (local server, live Gemini and Supabase)

A CC BY-SA 4.0 Wikimedia Commons photo of roadside waste burning was used:

- **Analysis:** waste burning with 0.95 model confidence and moderate visible intensity, in 7.8 s with `gemini-3.5-flash-lite`. The observations were factual and contained no numbers.
- **Rejected as expected:**
  - A forged analysis (category changed): 400 `analysis_mismatch`.
  - A location outside Jaipur: 400.
  - Missing consent: 400.
  - The duplicate photo: 409.
- **Valid submission:** 201.
  - The row was anonymous, with coordinates rounded to 26.912, 75.787.
  - The public API returned only the public columns.
  - The map showed the report.
- **Cleanup:** the test report and its photo were deleted afterwards.

The Wikimedia file had no EXIF data. Removal of EXIF and GPS is covered by a unit test with a synthetic EXIF segment.

## Tests

- **Unit tests** (`tests/unit/civic-reports.test.ts`) cover:
  - JPEG metadata stripping (EXIF and GPS removed, structure kept, deterministic, malformed input rejected) and photo input limits.
  - The analysis with Gemini mocked: image sent as inline data, AQI claims rejected, unusable photos, and consistency rules.
  - Token binding (photo, content, expiry and secret) and submitter hashing.
  - Submission validation.
- **Database tests** (`supabase/tests/database/rls.test.sql`) cover:
  - Anon sees only published reports and only public columns, and can't insert.
  - Anonymous integrity rules, the storage folder, hash retention and the hourly quota.
- **End-to-end tests** (`tests/e2e/reports.spec.ts`), with the APIs mocked, cover:
  - The full flow, an unusable photo, and an honest error state.
  - API validation (a forged token is rejected).

## Limitations and next steps

- **No moderation UI.** Hiding a report needs the service role.
- **Anonymous reports can't be edited or deleted** by whoever sent them.
- **Rate limits are by IP**, so shared networks share a quota.
- **Analysis is English only.**
- **Storage cleanup:** deleting a report through SQL leaves its photo in storage (an existing limitation in `docs/database.md`).
