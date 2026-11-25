import { z } from "zod";

/** One location in an Open-Meteo Air Quality response (timeformat=unixtime). */
export const openMeteoLocationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  hourly_units: z.record(z.string(), z.string()),
  hourly: z
    .object({ time: z.array(z.number().int()) })
    .catchall(z.array(z.number().nullable())),
});

/** A single point returns an object; several points return an array. */
export const openMeteoResponseSchema = z.union([
  z.array(openMeteoLocationSchema),
  openMeteoLocationSchema.transform((location) => [location]),
]);

export type OpenMeteoLocation = z.infer<typeof openMeteoLocationSchema>;
