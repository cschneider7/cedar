import { redirect } from "react-router"
import { supabaseContext } from "~/lib/supabase/context"
import { previewAuthGateMiddleware } from "~/middleware/preview-auth-gate"
import type { Route } from "./+types/callback"

export const middleware: Route.MiddlewareFunction[] = [
  previewAuthGateMiddleware,
]

/**
 * PKCE callback for every redirect-based auth flow
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url)

  if (url.searchParams.get("error")) {
    const reason =
      url.searchParams.get("error") === "access_denied"
        ? "oauth_denied"
        : "oauth_failed"
    throw redirect(`/login?error=${reason}`)
  }

  const code = url.searchParams.get("code")
  if (!code) {
    throw redirect("/login?error=oauth_failed")
  }

  const { client } = context.get(supabaseContext)
  const { error } = await client.auth.exchangeCodeForSession(code)
  if (error) {
    throw redirect("/login?error=oauth_failed")
  }

  if (url.searchParams.get("type") === "recovery") {
    throw redirect("/reset-password")
  }
  throw redirect("/")
}
