import { publicEnv } from "@/config/public-env";

export class SupabaseNotConfiguredError extends Error {
  constructor(missing: string) {
    super(`Supabase is not configured: ${missing} is missing.`);
    this.name = "SupabaseNotConfiguredError";
  }
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * Project URL and publishable (anon) key. Both are browser-safe by design;
 * Row Level Security is what protects the data.
 */
export function getSupabasePublicConfig(): { url: string; key: string } {
  const url = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  const key = publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new SupabaseNotConfiguredError("NEXT_PUBLIC_SUPABASE_URL");
  if (!key) throw new SupabaseNotConfiguredError("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return { url, key };
}
