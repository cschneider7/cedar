import { SignUp } from "@clerk/react-router"
import { getAuth } from "@clerk/react-router/server"
import { Link, redirect } from "react-router"
import { useClerkAppearance } from "~/hooks/use-clerk-appearance"
import type { Route } from "./+types/signup"

export function meta({}: Route.MetaArgs) {
  return [{ title: "Sign up - Seating Chart" }]
}

export async function loader(args: Route.LoaderArgs) {
  const { isAuthenticated } = await getAuth(args)
  if (isAuthenticated) throw redirect("/")
}

export default function Signup() {
  const appearance = useClerkAppearance()

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
      <Link to="/" className="font-medium">
        Seating Chart
      </Link>
      <SignUp
        routing="hash"
        fallbackRedirectUrl="/"
        signInUrl="/login"
        appearance={appearance}
      />
    </div>
  )
}
