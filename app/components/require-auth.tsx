import { useEffect } from "react"
import { useNavigate } from "react-router"
import { authClient } from "~/lib/auth-client"
import { Spinner } from "~/components/ui/spinner"

/**
 * Client-side replacement for the old `requireAuth` server middleware —
 * Neon Auth has no server-side session SDK for React Router, so this gates
 * `children` on `authClient.useSession()` instead, redirecting to `/login`
 * once the session settles as signed-out. Unlike the old server redirect,
 * this can briefly render nothing (a spinner) before the check resolves —
 * an accepted tradeoff, not a bug.
 * @param props - `children` to render once a session is confirmed present.
 * @returns The gated content, or a loading/redirect placeholder.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const session = authClient.useSession()
  const navigate = useNavigate()

  useEffect(() => {
    if (!session.isPending && !session.data) {
      navigate("/login", { replace: true })
    }
  }, [session.isPending, session.data, navigate])

  if (session.isPending || !session.data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-8" />
      </div>
    )
  }

  return children
}
