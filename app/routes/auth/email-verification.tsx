import { AuthView } from "@neondatabase/auth-ui"
import { AuthPageLayout } from "~/components/auth-page-layout"
import type { Route } from "./+types/email-verification"

export function meta({}: Route.MetaArgs) {
  return [{ title: "Email Verification - Cedar" }]
}

export default function EmailVerification() {
  return (
    <AuthPageLayout>
      <AuthView view="EMAIL_VERIFICATION" />
    </AuthPageLayout>
  )
}
