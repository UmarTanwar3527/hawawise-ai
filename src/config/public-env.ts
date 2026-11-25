import { parsePublicEnv } from "./env.schema";

/**
 * Browser-safe configuration. Each variable is referenced explicitly so
 * Next.js can inline it at build time. Never add a secret here: anything
 * prefixed NEXT_PUBLIC_ is shipped to the browser.
 */
export const publicEnv = parsePublicEnv({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
});
