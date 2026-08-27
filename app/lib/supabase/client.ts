import { createBrowserClient } from "@supabase/ssr"
import { SUPABASE_AUTH_COOKIE_NAME } from "~/lib/supabase/context"

/**
 * Builds a Supabase client for use in the browser
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    import.meta.env.VITE_PUBLIC_SUPABASE_URL!,
    import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: { name: SUPABASE_AUTH_COOKIE_NAME } }
  )
}

/**
 * Gets the current session's access token from the browser
 */
export async function getAccessTokenBrowser(): Promise<string | undefined> {
  const {
    data: { session },
  } = await createSupabaseBrowserClient().auth.getSession()
  return session?.access_token
}
