import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabasePublicConfig } from "./config";
import type { Database } from "./database.types";

/**
 * Supabase client for Server Components, Route Handlers and Server Actions,
 * acting as the current user (RLS applies).
 *
 * Reading cookies makes the caller request-time: with Cache Components,
 * render it inside a <Suspense> boundary.
 *
 * Session refresh across requests needs a proxy (proxy.ts in Next.js 16).
 * Add it together with authentication.
 */
export async function createSupabaseServerClient() {
  const { url, key } = getSupabasePublicConfig();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. The proxy refreshes sessions.
        }
      },
    },
  });
}
