import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicConfig } from "./config";
import type { Database } from "./database.types";

/**
 * Supabase client for Client Components. Uses the publishable key and the
 * signed-in user's session, so every query is subject to RLS.
 */
export function createSupabaseBrowserClient() {
  const { url, key } = getSupabasePublicConfig();
  return createBrowserClient<Database>(url, key);
}
