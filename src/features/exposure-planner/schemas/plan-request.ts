import { z } from "zod";

import { ACTIVITY_IDS, DURATION_OPTIONS } from "../constants";

const slug = z
  .string()
  .trim()
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

/**
 * A planning request. Every field has a safe default and an out-of-range value
 * falls back to it, so a hand-edited URL never breaks the page. The area slug
 * is the exception: it is checked against known areas by the caller.
 */
export const planRequestSchema = z.object({
  location: slug.default("jaipur-city-centre"),
  activity: z.enum(ACTIVITY_IDS).catch("walking"),
  duration: z.coerce
    .number()
    .int()
    .refine((value) => (DURATION_OPTIONS as readonly number[]).includes(value))
    .catch(45),
  day: z.enum(["today", "tomorrow"]).catch("today"),
  /** Earliest start, IST hour (0–23). */
  from: z.coerce.number().int().min(0).max(23).catch(5),
  /** Latest finish, IST hour (1–24). */
  to: z.coerce.number().int().min(1).max(24).catch(22),
  sensitive: z
    .union([z.boolean(), z.enum(["1", "0", "true", "false", "on"])])
    .transform((value) => value === true || value === "1" || value === "true" || value === "on")
    .catch(false),
});

export type PlanRequest = z.infer<typeof planRequestSchema>;

/** Builds a request from page search params (first value of each key). */
export function planRequestFromSearchParams(params: Record<string, string | string[] | undefined>) {
  const first = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  return planRequestSchema.safeParse({
    location: first("location"),
    activity: first("activity"),
    duration: first("duration"),
    day: first("day"),
    from: first("from"),
    to: first("to"),
    sensitive: first("sensitive"),
  });
}

export function planRequestToSearchParams(request: PlanRequest): string {
  const params = new URLSearchParams({
    location: request.location,
    activity: request.activity,
    duration: String(request.duration),
    day: request.day,
    from: String(request.from),
    to: String(request.to),
  });
  if (request.sensitive) params.set("sensitive", "1");
  return params.toString();
}

/** Body for the AI explanation endpoint: the same request plus a language. */
export const explainRequestSchema = z.object({
  location: slug,
  activity: z.enum(ACTIVITY_IDS),
  duration: z.number().int().refine((value) => (DURATION_OPTIONS as readonly number[]).includes(value)),
  day: z.enum(["today", "tomorrow"]),
  from: z.number().int().min(0).max(23),
  to: z.number().int().min(1).max(24),
  sensitive: z.boolean(),
  language: z.enum(["en", "hi"]),
});

export type ExplainRequest = z.infer<typeof explainRequestSchema>;
