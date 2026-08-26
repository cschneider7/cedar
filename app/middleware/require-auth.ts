import { redirect, type MiddlewareFunction } from "react-router"
import { supabaseContext } from "~/lib/supabase/context"

/**
 * Layout-level middleware gating an entire route subtree behind
 * authentication with a real server-side redirect — the replacement for
 * the old client-only `<RedirectToSignIn>`/`<SignedIn>` pattern. Relies on
 * the root `supabaseSessionMiddleware` having already resolved `user`.
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
