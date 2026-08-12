import { SignIn } from "@clerk/react-router"
import { getAuth } from "@clerk/react-router/server"
import { Link, redirect } from "react-router"
import { ThemeToggle } from "~/components/ui/theme-toggle"
import { Wordmark } from "~/components/wordmark"
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
    <div className="relative flex h-full flex-col items-center justify-center gap-6 p-6">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Link to="/">
        <Wordmark textClassName="font-medium" />
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
