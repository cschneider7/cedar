import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr"
import { SUPABASE_AUTH_COOKIE_NAME } from "~/lib/supabase/context"

/**
 * Builds a per-request Supabase client that reads the session from the
 * request's cookies and accumulates any refreshed session's `Set-Cookie`
 * writes onto `headers`, which the caller must copy onto the outgoing
 * response — see `~/middleware/supabase-session`.
 *
 * `cookieOptions.name` is pinned explicitly (see `SUPABASE_AUTH_COOKIE_NAME`)
 * since Supabase's default cookie name is otherwise derived from this
 * client's URL — without pinning it, a server/browser URL mismatch would
 * silently derive different, mismatched cookie names.
 */
export function createSupabaseServerClient(request: Request, headers: Headers) {
  return createServerClient(
    import.meta.env.VITE_PUBLIC_SUPABASE_URL!,
    import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { name: SUPABASE_AUTH_COOKIE_NAME },
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get("Cookie") ?? "")
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            headers.append(
              "Set-Cookie",
              serializeCookieHeader(name, value, options)
            )
          })
        },
      },
    }
  )
}
