import { z } from "zod";

import { AI_CATEGORY_IDS, REPORT_CATEGORY_IDS, REPORT_LIMITS, VISIBLE_SEVERITY, isInJaipurArea } from "./constants";

const shortText = z.string().trim().min(1).max(200);

/** What the model must return through submit_photo_analysis. */
export const modelAnalysisSchema = z.object({
  imageUsable: z.boolean(),
  imageIssue: z.enum(["none", "not_outdoor_scene", "too_dark_or_blurry", "screenshot_or_artwork", "inappropriate"]),
  pollutionVisible: z.boolean(),
  category: z.enum(AI_CATEGORY_IDS),
  confidence: z.number().min(0).max(1),
  visibleSeverity: z.enum(Object.keys(VISIBLE_SEVERITY) as [keyof typeof VISIBLE_SEVERITY]),
  observations: z.array(shortText).min(1).max(5),
  recommendations: z.array(shortText).max(3).default([]),
  limitations: z.array(shortText).max(3).default([]),
  peopleVisible: z.boolean().default(false),
  licencePlatesReadable: z.boolean().default(false),
});

export type ModelAnalysis = z.infer<typeof modelAnalysisSchema>;

/** The analysis returned to the browser and signed; limitations include fixed server text. */
export const photoAnalysisSchema = modelAnalysisSchema.extend({
  /** Up to 3 from the model plus the fixed server limitations. */
  limitations: z.array(shortText).max(5),
  canSubmit: z.boolean(),
  model: z.string().max(100),
  promptVersion: z.string().max(100),
  analysedAt: z.iso.datetime(),
});

export type PhotoAnalysis = z.infer<typeof photoAnalysisSchema>;

const URL_LIKE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|in|net|org|io|xyz|ly)\b)/i;

/** Text fields of the final submission (the photo travels separately). */
export const reportSubmissionSchema = z
  .object({
    category: z.enum(REPORT_CATEGORY_IDS, { message: "Choose what you are reporting." }),
    latitude: z.coerce.number().finite(),
    longitude: z.coerce.number().finite(),
    description: z
      .string()
      .trim()
      .max(REPORT_LIMITS.maxDescription, `Keep the description to ${REPORT_LIMITS.maxDescription} characters.`)
      .refine((value) => !URL_LIKE.test(value), "Links are not allowed in descriptions.")
      .transform((value) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ""))
      .default(""),
    consent: z.literal("yes", { message: "Please confirm the photo and report terms." }),
    analysis: z.string().max(8_000),
    token: z.string().min(10).max(200),
  })
  .refine((value) => isInJaipurArea(value.latitude, value.longitude), {
    message: "Choose a location in the Jaipur area.",
    path: ["latitude"],
  });

export type ReportSubmission = z.infer<typeof reportSubmissionSchema>;

/** A published report as the public sees it. */
export type PublicReport = {
  id: string;
  category: string;
  aiCategory: string | null;
  aiConfidence: number | null;
  visibleSeverity: string | null;
  latitude: number;
  longitude: number;
  status: string;
  verificationStatus: string;
  createdAt: string;
};
