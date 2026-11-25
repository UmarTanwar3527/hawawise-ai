import { z } from "zod";

/** Response schemas for the parts of OpenAQ v3 that Hawa AI uses. */

/** UTC timestamps must be valid ISO 8601; an unparseable date would bypass time filters. */
const dateTime = z.object({ utc: z.iso.datetime({ offset: true }), local: z.string().optional() });

const parameter = z.object({ name: z.string(), units: z.string() });

export const openAqLocationSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  isMonitor: z.boolean().optional().default(false),
  isMobile: z.boolean().optional().default(false),
  provider: z.object({ name: z.string() }).nullable().optional(),
  owner: z.object({ name: z.string() }).nullable().optional(),
  coordinates: z.object({ latitude: z.number(), longitude: z.number() }),
  sensors: z.array(z.object({ id: z.number().int(), parameter })),
  datetimeLast: dateTime.nullable().optional(),
});

export const openAqLocationsResponseSchema = z.object({
  results: z.array(openAqLocationSchema),
});

export const openAqLatestResponseSchema = z.object({
  results: z.array(
    z.object({
      sensorsId: z.number().int(),
      datetime: dateTime,
      value: z.number().nullable(),
    }),
  ),
});

export const openAqHoursResponseSchema = z.object({
  results: z.array(
    z.object({
      value: z.number().nullable(),
      parameter,
      period: z.object({ datetimeFrom: dateTime, datetimeTo: dateTime }),
      coverage: z
        .object({ percentComplete: z.number().nullable().optional() })
        .nullable()
        .optional(),
    }),
  ),
});

export type OpenAqLocation = z.infer<typeof openAqLocationSchema>;
export type OpenAqLatestResponse = z.infer<typeof openAqLatestResponseSchema>;
export type OpenAqHoursResponse = z.infer<typeof openAqHoursResponseSchema>;
