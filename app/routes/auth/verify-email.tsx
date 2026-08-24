import { AuthView } from "@neondatabase/auth-ui"
import { useEffect } from "react"
import { useNavigate } from "react-router"
import { NeonAuthUI } from "~/components/neon-auth-ui-provider"
import { ThemeToggle } from "~/components/ui/theme-toggle"
import { Wordmark } from "~/components/wordmark"
import { authClient } from "~/lib/auth-client"
import type { Route } from "./+types/verify-email"

export function meta({}: Route.MetaArgs) {
  return [{ title: "Verify your email - Cedar" }]
}

// Landed on from signup (with ?email=...) once Neon Auth's email/password
// method requires verification, and from the sign-in form itself if it hits
// an EMAIL_NOT_VERIFIED error. auth-ui's own EmailVerificationForm reads the
// email off the query string and drives the whole code-entry/resend flow via
// authClient.emailOtp — nothing route-specific needed here beyond rendering
// the view and matching the redirect-if-already-authenticated pattern the
// other pre-auth pages use.
export default function VerifyEmail() {
  const session = authClient.useSession()
  const navigate = useNavigate()

  useEffect(() => {
    if (session.data) {
      navigate("/", { replace: true })
    }
  }, [session.data, navigate])

  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-6 p-6">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Wordmark textClassName="font-medium" />
      <NeonAuthUI>
        <AuthView view="EMAIL_VERIFICATION" />
      </NeonAuthUI>
    </div>
  )
}
