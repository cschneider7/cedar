import { AuthView } from "@neondatabase/auth-ui"
import { NeonAuthUI } from "~/components/neon-auth-ui-provider"
import { ThemeToggle } from "~/components/ui/theme-toggle"
import { Wordmark } from "~/components/wordmark"
import type { Route } from "./+types/reset-password"

export function meta({}: Route.MetaArgs) {
  return [{ title: "Reset password - Cedar" }]
}

// Landed on from the reset-password email link (?token=...) — read and
// validated entirely by auth-ui's own ResetPasswordForm, which redirects to
// /login itself if the token is missing/invalid. No "redirect if already
// authenticated" check here (unlike login/signup/forgot-password): the link
// must stay usable regardless of the browser's current session state.
export default function ResetPassword() {
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-6 p-6">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Wordmark textClassName="font-medium" />
      <NeonAuthUI>
        <AuthView view="RESET_PASSWORD" />
      </NeonAuthUI>
    </div>
  )
}
