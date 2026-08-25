import { AuthView } from "@neondatabase/auth-ui"
import { AuthPageLayout } from "~/components/auth-page-layout"
import type { Route } from "./+types/sign-out"

export function meta({}: Route.MetaArgs) {
  return [{ title: "Sign Out - Cedar" }]
}

export default function SignOut() {
  return (
    <AuthPageLayout>
      <AuthView view="SIGN_OUT" redirectTo="/" />
    </AuthPageLayout>
  )
}
