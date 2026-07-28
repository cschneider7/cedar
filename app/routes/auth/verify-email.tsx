import { CheckCircle2Icon, XCircleIcon } from "lucide-react"
import { Link, useLoaderData } from "react-router"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { AuthApiError, verifyEmail } from "~/lib/api"
import { cookieFromRequest } from "~/lib/auth"
import type { Route } from "./+types/verify-email"

export async function loader({ request }: Route.LoaderArgs) {
  const token = new URL(request.url).searchParams.get("token")
  if (!token) {
    return {
      ok: false as const,
      error: "This verification link is invalid or has expired",
    }
  }

  try {
    await verifyEmail(token, cookieFromRequest(request))
    return { ok: true as const }
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { ok: false as const, error: error.message }
    }
    throw error
  }
}

export default function VerifyEmail() {
  const data = useLoaderData<typeof loader>()

  if (data.ok) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CheckCircle2Icon className="mb-2 size-8 text-primary" />
          <CardTitle>Email verified</CardTitle>
          <CardDescription>
            Your email has been verified. You can now log in.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button render={<Link to="/login" />} className="w-full">
            Log in
          </Button>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <XCircleIcon className="mb-2 size-8 text-destructive" />
        <CardTitle>Verification failed</CardTitle>
        <CardDescription>{data.error}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button
          variant="outline"
          render={<Link to="/signup" />}
          className="w-full"
        >
          Sign up again
        </Button>
      </CardFooter>
    </Card>
  )
}
