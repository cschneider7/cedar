import { createAuthClient } from "@neondatabase/auth"
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters"

const NEON_AUTH_URL = import.meta.env.VITE_NEON_AUTH_URL
if (!NEON_AUTH_URL) {
  throw new Error("VITE_NEON_AUTH_URL is not set")
}

/**
 * The Neon Auth client, built with the React adapter for `useSession()`.
 * Replaces `@clerk/react-router`'s server-side `getAuth`/`rootAuthLoader` —
 * there's no server SDK for React Router, so every auth read/write goes
 * through this client in the browser (see `clientLoader`/`clientAction`
 * usage across `app/routes/**`).
 */
export const authClient = createAuthClient(NEON_AUTH_URL, {
  adapter: BetterAuthReactAdapter(),
})

// Better Auth's JWT plugin delivers a fresh JWT via a `set-auth-jwt`
// response header on every session-bearing request (confirmed against the
// real Neon Auth API); the client's own response interceptor swaps it into
// `session.session.token`, overwriting the opaque session token that field
// would otherwise hold. That's the one verified way to get a JWT out of
// this beta client — its dedicated `getJWTToken` helper lives on an
// internal adapter wrapper `createAuthClient()` doesn't expose, and calling
// the JWT plugin's `token` action directly (`authClient.token()`) 401s
// here for reasons that didn't reproduce outside the app, so route through
// `getSession()` instead, which is confirmed to work.
type SessionWithJwt = {
  data: { session?: { token?: string } } | null
}

/**
 * A fresh bearer token for the current session, or `undefined` if signed
 * out — the direct replacement for `tokenFromRequest`'s Clerk-derived token.
 * Never throws: every `clientLoader`/`clientAction` calling this expects a
 * graceful `undefined` on any failure, relying on `RequireAuth`'s redirect
 * rather than an ErrorBoundary to handle the signed-out case.
 * @returns The session's JWT, or `undefined`.
 */
export async function getBearerToken(): Promise<string | undefined> {
  try {
    const { data } = (await authClient.getSession()) as SessionWithJwt
    return data?.session?.token ?? undefined
  } catch {
    return undefined
  }
}
