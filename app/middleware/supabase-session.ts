import type { MiddlewareFunction } from "react-router"
import { supabaseContext } from "~/lib/supabase/context"
import { createSupabaseServerClient } from "~/lib/supabase/server"

/**
 * Middleware that builds a Supabase server client and resolves the current user
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
