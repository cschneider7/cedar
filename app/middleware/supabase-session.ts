import type { MiddlewareFunction } from "react-router"
import { supabaseContext } from "~/lib/supabase/context"
import { createSupabaseServerClient } from "~/lib/supabase/server"

/**
 * Root-level middleware: builds a per-request Supabase server client,
 * resolves the current user (validated against the Auth server, not just
 * decoded from the cookie), and makes both available to every downstream
 * loader/action/middleware via `supabaseContext`. Runs once per request
 * regardless of which route matched, and copies any refreshed session's
 * `Set-Cookie` headers onto the outgoing response — missing that write
 * would silently log the user out on their next request.
 */
export const supabaseSessionMiddleware: MiddlewareFunction<Response> = async (
  { request, context },
  next
) => {
  const headers = new Headers()
  const client = createSupabaseServerClient(request, headers)
  const {
    data: { user },
  } = await client.auth.getUser()
  context.set(supabaseContext, { client, user })

  const response = await next()
  headers.forEach((value, key) => response.headers.append(key, value))
  return response
}
