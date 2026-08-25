import { AuthView } from "@neondatabase/auth-ui"
import { AuthPageLayout } from "~/components/auth-page-layout"
import type { Route } from "./+types/sign-in"

export function meta({}: Route.MetaArgs) {
  return [{ title: "Sign In - Cedar" }]
}

export default function SignIn() {
  return (
    <AuthPageLayout>
      <AuthView view="SIGN_IN" />
    </AuthPageLayout>
  )
}
