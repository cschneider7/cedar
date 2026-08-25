import { AuthView } from "@neondatabase/auth-ui"
import { AuthPageLayout } from "~/components/auth-page-layout"
import type { Route } from "./+types/sign-up"

export function meta({}: Route.MetaArgs) {
  return [{ title: "Sign Up - Cedar" }]
}

export default function SignUp() {
  return (
    <AuthPageLayout>
      <AuthView view="SIGN_UP" />
    </AuthPageLayout>
  )
}
