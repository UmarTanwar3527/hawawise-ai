import { z } from "zod";

/**
 * Environment variable schemas.
 *
 * This module is pure (no `server-only` import) so it can be unit tested.
 * Application code should import `publicEnv` from `./public-env` or
 * `getServerEnv` from `./env` instead of using these parsers directly.
 *
 * Integration keys are optional during the foundation phase. Each
 * integration must check for its key and surface an explicit
 * "not configured" state rather than failing silently.
 */

/** Treat empty strings (e.g. `KEY=` in .env.local) as "not set". */
const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1).optional(),
);

const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional());

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.preprocess(
    emptyToUndefined,
    z.url().default("http://localhost:3000"),
  ),
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: optionalString,
});

export const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  GEMINI_API_KEY: optionalString,
  GOOGLE_AIR_QUALITY_API_KEY: optionalString,
  OPENAQ_API_KEY: optionalString,
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

type EnvInput = Record<string, string | undefined>;

/**
 * Builds an error message from variable names and validation messages only.
 * Values are never included, so secrets cannot leak into logs.
 */
function describeIssues(scope: string, error: z.ZodError): string {
  const details = error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  return `Invalid ${scope} environment variables:\n${details}`;
}

export function parsePublicEnv(input: EnvInput): PublicEnv {
  const result = publicEnvSchema.safeParse(input);
  if (!result.success) throw new Error(describeIssues("public", result.error));
  return result.data;
}

export function parseServerEnv(input: EnvInput): ServerEnv {
  const result = serverEnvSchema.safeParse(input);
  if (!result.success) throw new Error(describeIssues("server", result.error));
  return result.data;
}
