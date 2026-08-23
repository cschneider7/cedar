import { SignUp } from "@clerk/react-router"
import { getAuth } from "@clerk/react-router/server"
import { Link, redirect } from "react-router"
import { ThemeToggle } from "~/components/ui/theme-toggle"
import { Wordmark } from "~/components/wordmark"
import { useClerkAppearance } from "~/hooks/use-clerk-appearance"
import type { Route } from "./+types/signup"

export function meta({}: Route.MetaArgs) {
  return [{ title: "Sign up - Cedar" }]
}

export async function loader(args: Route.LoaderArgs) {
  const { isAuthenticated } = await getAuth(args)
  if (isAuthenticated) throw redirect("/")
}

export default function Signup() {
  const appearance = useClerkAppearance()

  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-6 p-6">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Link to="/">
        <Wordmark textClassName="font-medium" />
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
