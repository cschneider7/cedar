import { AuthView } from "@neondatabase/auth-ui"
import { AuthPageLayout } from "~/components/auth-page-layout"
import type { Route } from "./+types/forgot-password"

export function meta({}: Route.MetaArgs) {
  return [{ title: "Forgot Password - Cedar" }]
}

export default function ForgotPassword() {
  return (
    <AuthPageLayout>
      <AuthView view="FORGOT_PASSWORD" />
    </AuthPageLayout>
  )
}
