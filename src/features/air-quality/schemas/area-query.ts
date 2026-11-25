import { z } from "zod";

/** Query parameters for the public air-quality endpoints. */
export const areaQuerySchema = z.object({
  location: z
    .string()
    .trim()
    .max(80)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .default("jaipur-city-centre"),
});

export const forecastQuerySchema = areaQuerySchema.extend({
  hours: z.coerce.number().int().min(1).max(120).default(96),
});
