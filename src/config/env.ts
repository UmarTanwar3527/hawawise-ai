import "server-only";

import { parseServerEnv, type ServerEnv } from "./env.schema";

let cached: ServerEnv | undefined;

/**
 * Server-only secrets (Gemini, Air Quality, OpenAQ, Supabase service role).
 * Importing this module from a Client Component fails the build, which
 * keeps these keys out of the browser bundle.
 */
export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
