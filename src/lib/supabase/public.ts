import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabasePublicConfig } from "./config";
import type { Database } from "./database.types";

/**
 * Anonymous, cookie-free client for reading public environmental data on the
 * server. RLS limits it to what any visitor may read. Because it does not
 * touch cookies, results can be cached and shared across visitors.
 */
export function createSupabasePublicClient() {
  const { url, key } = getSupabasePublicConfig();
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
