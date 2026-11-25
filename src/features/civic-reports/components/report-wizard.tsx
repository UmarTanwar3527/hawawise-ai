"use client";

import { useEffect, useId, useState, useSyncExternalStore, type ChangeEvent, type FormEvent } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils/cn";

import { REPORT_CATEGORIES, REPORT_CATEGORY_IDS, REPORT_LIMITS, type ReportCategory } from "../constants";
import type { PhotoAnalysis } from "../schemas";

import { AnalysisCard } from "./analysis-card";
import { LocationPicker, type PickedLocation } from "./location-picker";

type Area = { slug: string; name: string; latitude: number; longitude: number };

const subscribeNothing = () => () => {};
type Photo = { blob: Blob; url: string };

/**
 * Re-encodes the photo as a JPEG of at most 1600 px. Re-drawing on a canvas
 * drops all metadata (EXIF, including GPS) before anything is uploaded, and
 * converts formats such as HEIC that the browser can display.
 */
async function toJpeg(file: File): Promise<Blob> {
  let source: CanvasImageSource & { width: number; height: number };
  try {
    source = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      source = image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const scale = Math.min(1, REPORT_LIMITS.maxImageEdge / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("encode");
  return blob;
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

export function ReportWizard({ areas }: { areas: Area[] }) {
  const id = useId();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [analysis, setAnalysis] = useState<{ result: PhotoAnalysis; token: string } | null>(null);
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [location, setLocation] = useState<PickedLocation | null>(null);
  const [description, setDescription] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<"preparing" | "analysing" | "submitting" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  // The photo input does nothing until React is interactive; keep it disabled until then.
  const interactive = useSyncExternalStore(subscribeNothing, () => true, () => false);

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

  const reset = () => {
    setPhoto(null);
    setAnalysis(null);
    setCategory(null);
    setLocation(null);
    setDescription("");
    setConsent(false);
    setError(null);
    setSubmittedId(null);
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setAnalysis(null);
    setCategory(null);
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    setBusy("preparing");
    try {
      const blob = await toJpeg(file);
      if (blob.size > REPORT_LIMITS.maxImageBytes) throw new Error("size");
      setPhoto({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setError("This photo could not be read. Try a JPEG or PNG photo.");
    } finally {
      setBusy(null);
    }
  };

  const analyse = async () => {
    if (!photo) return;
    setBusy("analysing");
    setError(null);
    try {
      const body = new FormData();
      body.set("photo", photo.blob, "photo.jpg");
      const response = await fetch("/api/reports/analyze", { method: "POST", body });
      if (!response.ok) {
        setError(await errorMessage(response, "The photo could not be analysed. Please try again."));
        return;
      }
      const data = (await response.json()) as { analysis: PhotoAnalysis; token: string };
      setAnalysis({ result: data.analysis, token: data.token });
      setCategory(data.analysis.category === "none_visible" ? null : data.analysis.category);
    } catch {
      setError("Could not reach Hawa AI. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!photo || !analysis || !category || !location || !consent) return;
    setBusy("submitting");
    setError(null);
    try {
      const body = new FormData();
      body.set("photo", photo.blob, "photo.jpg");
      body.set("category", category);
      body.set("latitude", String(location.latitude));
      body.set("longitude", String(location.longitude));
      body.set("description", description);
      body.set("consent", "yes");
      body.set("analysis", JSON.stringify(analysis.result));
      body.set("token", analysis.token);
      const response = await fetch("/api/reports", { method: "POST", body });
      if (!response.ok) {
        setError(await errorMessage(response, "The report could not be saved. Please try again."));
        return;
      }
      setSubmittedId(((await response.json()) as { id: string }).id);
    } catch {
      setError("Could not reach Hawa AI. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  if (submittedId) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-start gap-3" role="status">
          <span className="grid size-10 place-items-center rounded-full bg-green-50 text-green-700">
            <Icon name="check" size={20} />
          </span>
          <h2 className="text-lg font-semibold text-ink">Report submitted</h2>
          <p className="max-w-prose text-sm text-ink-muted">
            Thank you. Your report now appears on the map as an <strong>unverified community report</strong>, with its
            category, approximate location and time. The photo and description are kept private for review. This is not
            an official complaint.
          </p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/map?report=${submittedId}`}>
              <Icon name="map" size={16} />
              View on the map
            </ButtonLink>
            <Button type="button" variant="secondary" onClick={reset}>
              Report something else
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  const ready = Boolean(photo && analysis?.result.canSubmit && category && location && consent);

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" aria-busy={busy !== null}>
      <Card>
        <CardHeader title="1. Photo" description="Take or choose a photo of the pollution source." />
        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor={`${id}-photo`}
              className={cn(
                "inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-ink shadow-sm hover:bg-canvas",
                "has-disabled:cursor-wait has-disabled:opacity-60",
                "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary",
              )}
            >
              <Icon name="plus" size={16} />
              {photo ? "Choose a different photo" : "Take or choose a photo"}
              <input
                id={`${id}-photo`}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={onFile}
                disabled={!interactive || busy !== null}
              />
            </label>
            {photo && !analysis ? (
              <Button type="button" onClick={analyse} disabled={busy !== null}>
                <Icon name="sparkle" size={16} />
                {busy === "analysing" ? "Analysing photo…" : "Analyse with AI"}
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-ink-subtle">
            Location data and other metadata are removed from the photo in your browser before upload. Photos are never
            published.
          </p>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview of an object URL
            <img src={photo.url} alt="Selected photo" className="max-h-80 w-auto max-w-full self-start rounded-lg border border-line object-contain" />
          ) : null}
          {busy === "preparing" ? <p className="text-sm text-ink-subtle">Preparing photo…</p> : null}
          {analysis ? <AnalysisCard analysis={analysis.result} /> : null}
        </div>
      </Card>

      {analysis?.result.canSubmit ? (
        <>
          <Card>
            <CardHeader
              title="2. What did you see?"
              description={
                analysis.result.category === "none_visible"
                  ? "The AI could not see a pollution source. Choose what you are reporting."
                  : "The AI's suggestion is selected. Change it if it's wrong."
              }
            />
            <fieldset className="grid gap-2 p-5 sm:grid-cols-2">
              <legend className="sr-only">Category</legend>
              {REPORT_CATEGORY_IDS.map((value) => (
                <label
                  key={value}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line-control bg-surface px-3 text-sm text-ink",
                    "has-checked:border-primary has-checked:bg-primary-soft has-checked:text-primary-strong",
                    "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary",
                  )}
                >
                  <input
                    type="radio"
                    name="category"
                    value={value}
                    checked={category === value}
                    onChange={() => setCategory(value)}
                    className="size-4 accent-primary"
                  />
                  {REPORT_CATEGORIES[value].label}
                  {analysis.result.category === value ? (
                    <span className="ml-auto text-xs text-ink-subtle">AI suggestion</span>
                  ) : null}
                </label>
              ))}
            </fieldset>
          </Card>

          <Card>
            <CardHeader title="3. Where?" description="Place the pin where you saw it. Only an approximate location is shown publicly." />
            <div className="p-5">
              <LocationPicker areas={areas} value={location} onChange={setLocation} />
            </div>
          </Card>

          <Card>
            <CardHeader title="4. Details and consent" />
            <div className="flex flex-col gap-4 p-5">
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-description`} className="text-sm font-medium text-ink">
                  Description <span className="font-normal text-ink-subtle">(optional, kept private)</span>
                </label>
                <textarea
                  id={`${id}-description`}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={REPORT_LIMITS.maxDescription}
                  rows={3}
                  placeholder="For example: smoke from burning waste near the park, most evenings."
                  className="rounded-lg border border-line-control bg-surface px-3 py-2 text-sm text-ink"
                />
                <span className="text-xs text-ink-subtle">
                  {description.length}/{REPORT_LIMITS.maxDescription}. No links or personal details.
                </span>
              </div>
              <label className="flex items-start gap-3 rounded-lg border border-line bg-canvas p-3 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                />
                <span>
                  I took this photo or may share it. I understand that the category, approximate location (about 110 m)
                  and time will be shown publicly as an <strong>unverified community report</strong>, that the photo and
                  description stay private for review, and that this is not an official complaint.
                </span>
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={!ready || busy !== null}>
                  <Icon name="flag" size={16} />
                  {busy === "submitting" ? "Submitting…" : "Submit report"}
                </Button>
                {!ready ? (
                  <span className="text-xs text-ink-subtle">
                    {!category ? "Choose a category. " : ""}
                    {!location ? "Place the pin. " : ""}
                    {!consent ? "Confirm the consent." : ""}
                  </span>
                ) : null}
              </div>
            </div>
          </Card>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {busy === "analysing" ? "Analysing photo" : busy === "submitting" ? "Submitting report" : ""}
      </p>
    </form>
  );
}
