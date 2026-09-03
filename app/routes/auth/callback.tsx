import type { EmailOtpType } from "@supabase/supabase-js"
import { redirect } from "react-router"
import { supabaseContext } from "~/lib/supabase/context"
import { previewAuthGateMiddleware } from "~/middleware/preview-auth-gate"
import type { Route } from "./+types/callback"

export const middleware: Route.MiddlewareFunction[] = [
  previewAuthGateMiddleware,
]

/**
 * Landing route for every email link and OAuth redirect. Email links carry a
 * `token_hash` (verified with `verifyOtp`, works cross-device); OAuth carries a
 * PKCE `code` (exchanged for a session on the originating device).
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

  const { client } = context.get(supabaseContext)
  const type = url.searchParams.get("type")
  const tokenHash = url.searchParams.get("token_hash")

  if (tokenHash && type) {
    const { error } = await client.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    })
    if (error) {
      throw redirect("/login?error=oauth_failed")
    }
    throw redirect(type === "recovery" ? "/reset-password" : "/")
  }

  const code = url.searchParams.get("code")
  if (!code) {
    throw redirect("/login?error=oauth_failed")
  }

  const { error } = await client.auth.exchangeCodeForSession(code)
  if (error) {
    throw redirect("/login?error=oauth_failed")
  }

  if (type === "recovery") {
    throw redirect("/reset-password")
  }
  throw redirect("/")
}
