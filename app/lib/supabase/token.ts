import type { RouterContextProvider } from "react-router"
import { supabaseContext } from "~/lib/supabase/context"

/**
 * Gets the current request's Supabase access token, for passing through to
 * the Rust API (`~/lib/api.ts`'s `token` params).
 */
export async function getAccessToken(
  context: Readonly<RouterContextProvider>
): Promise<string | undefined> {
  const { client } = context.get(supabaseContext)
  const {
    data: { session },
  } = await client.auth.getSession()
  return session?.access_token
}
