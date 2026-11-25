import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/config/env";

import { getSupabasePublicConfig, SupabaseNotConfiguredError } from "./config";
import type { Database } from "./database.types";

/**
 * Privileged Supabase client using the secret (service role) key.
 * It BYPASSES Row Level Security, so use it only in trusted server code for
 * system writes: provider ingestion, assistant messages, alerts, report
 * moderation. Never use it to serve a user's own request when the user
 * client would do.
 */
export function createSupabaseAdminClient() {
  const { url } = getSupabasePublicConfig();
  const secretKey = getServerEnv().SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey) throw new SupabaseNotConfiguredError("SUPABASE_SERVICE_ROLE_KEY");

  return createClient<Database>(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
