import { createBrowserClient } from "@supabase/ssr"
import { SUPABASE_AUTH_COOKIE_NAME } from "~/lib/supabase/context"

/**
 * Builds a Supabase client for use in the browser. Used only by client
 * components that call auth methods directly (login/signup forms, the
 * topbar's sign-out action) — server-side data loading goes through the
 * per-request server client instead (`~/lib/supabase/server`).
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    import.meta.env.VITE_PUBLIC_SUPABASE_URL!,
    import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: { name: SUPABASE_AUTH_COOKIE_NAME } }
  )
}

/**
 * Gets the current session's access token from the browser, for the
 * handful of client-only fetches that can't go through a `loader`/`action`
 * (an authenticated `<img>`-backing fetch, a client-side polling hook).
 */
export async function getAccessTokenBrowser(): Promise<string | undefined> {
  const {
    data: { session },
  } = await createSupabaseBrowserClient().auth.getSession()
  return session?.access_token
}
