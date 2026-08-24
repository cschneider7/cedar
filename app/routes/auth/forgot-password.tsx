import { AuthView } from "@neondatabase/auth-ui"
import { useEffect } from "react"
import { useNavigate } from "react-router"
import { NeonAuthUI } from "~/components/neon-auth-ui-provider"
import { ThemeToggle } from "~/components/ui/theme-toggle"
import { Wordmark } from "~/components/wordmark"
import { authClient } from "~/lib/auth-client"
import type { Route } from "./+types/forgot-password"

export function meta({}: Route.MetaArgs) {
  return [{ title: "Forgot password - Cedar" }]
}

export default function ForgotPassword() {
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
        <AuthView view="FORGOT_PASSWORD" />
      </NeonAuthUI>
    </div>
  )
}
