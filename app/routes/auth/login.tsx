import { SignIn } from "@clerk/react-router"
import { getAuth } from "@clerk/react-router/server"
import { Link, redirect } from "react-router"
import { useClerkAppearance } from "~/hooks/use-clerk-appearance"
import type { Route } from "./+types/login"

export function meta({}: Route.MetaArgs) {
  return [{ title: "Sign in - Seating Chart" }]
}

export async function loader(args: Route.LoaderArgs) {
  const { isAuthenticated } = await getAuth(args)
  if (isAuthenticated) throw redirect("/")
}

export default function Login() {
  const appearance = useClerkAppearance()

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
      <Link to="/" className="font-medium">
        Seating Chart
      </Link>
      <SignIn
        routing="hash"
        fallbackRedirectUrl="/"
        signUpUrl="/signup"
        appearance={appearance}
      />
    </div>
  )
}
