import { createAuthClient } from "@neondatabase/auth"
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters"

// The Neon Auth client (React adapter, so `.useSession()` is a hook)
export const authClient = createAuthClient(
  import.meta.env.VITE_NEON_AUTH_URL!,
  {
    adapter: BetterAuthReactAdapter(),
  }
)

/**
 * Gets the JWT for the current session, or `undefined` if signed out
 * @returns The session's JWT, or `undefined`.
 */
export async function getAuthToken(): Promise<string | undefined> {
  const { data } = await authClient.getSession()
  return data?.session?.token ?? undefined
}
