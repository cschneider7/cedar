import { redirect, type MiddlewareFunction } from "react-router"
import { supabaseContext } from "~/lib/supabase/context"

/**
 * Layout-level middleware gating a route subtree behind authentication,
 * redirecting to login if the user is not signed in.
 */
export const requireAuthMiddleware: MiddlewareFunction<Response> = (
  { context },
  next
) => {
  const { user } = context.get(supabaseContext)
  if (!user) {
    throw redirect("/login")
  }
  return next()
}
