import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr"
import { SUPABASE_AUTH_COOKIE_NAME } from "~/lib/supabase/context"

/**
 * Builds a per-request Supabase client
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
