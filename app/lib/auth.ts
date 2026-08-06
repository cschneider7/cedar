import { getAuth } from "@clerk/react-router/server"
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router"
import { redirect } from "react-router"

/** Loader guard: redirects to `/login` if unauthenticated, otherwise returns
 * a bearer token for forwarding to the backend. */
export async function requireToken(args: LoaderFunctionArgs): Promise<string> {
  const { isAuthenticated, getToken } = await getAuth(args)
  const token = isAuthenticated ? await getToken() : null
  if (!token) {
    throw redirect("/login")
  }
  return token
}

/** Action-only helper: no redirect, just best-effort token forwarding —
 * matches the backend's own 401 as the source of truth for these
 * mutation-only routes. */
export async function tokenFromRequest(
  args: LoaderFunctionArgs | ActionFunctionArgs
): Promise<string | undefined> {
  const { getToken } = await getAuth(args)
  return (await getToken()) ?? undefined
}
