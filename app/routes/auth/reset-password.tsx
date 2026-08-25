import { AuthView } from "@neondatabase/auth-ui"
import { AuthPageLayout } from "~/components/auth-page-layout"
import type { Route } from "./+types/reset-password"

export function meta({}: Route.MetaArgs) {
  return [{ title: "Reset Password - Cedar" }]
}

export default function ResetPassword() {
  return (
    <AuthPageLayout>
      <AuthView view="RESET_PASSWORD" />
    </AuthPageLayout>
  )
}
