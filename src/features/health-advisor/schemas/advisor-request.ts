import { z } from "zod";

import { ACTIVITY_IDS, PROFILE_IDS } from "../constants";

const slug = z
  .string()
  .trim()
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

/** Out-of-range values fall back to safe defaults; the area slug is checked by the caller. */
export const advisorRequestSchema = z.object({
  location: slug.default("jaipur-city-centre"),
  profile: z.enum(PROFILE_IDS).catch("unspecified"),
  activity: z.enum(ACTIVITY_IDS).catch("outdoor"),
});

export type AdvisorRequest = z.infer<typeof advisorRequestSchema>;

export function advisorRequestFromSearchParams(params: Record<string, string | string[] | undefined>) {
  const first = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  return advisorRequestSchema.safeParse({ location: first("location"), profile: first("profile"), activity: first("activity") });
}

export function advisorHref(request: Partial<AdvisorRequest>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(request)) if (value) params.set(key, value);
  const query = params.toString();
  return query ? `/advisor?${query}` : "/advisor";
}

export const advisorExplainSchema = z.object({
  location: slug,
  profile: z.enum(PROFILE_IDS),
  activity: z.enum(ACTIVITY_IDS),
  language: z.enum(["en", "hi"]),
});
