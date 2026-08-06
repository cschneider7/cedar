import { getAuth } from "@clerk/react-router/server"
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router"
import { redirect } from "react-router"

/** Only accept same-app relative paths ("/foo", not "//evil.com" or an
 * absolute URL) as a post-login redirect target. */
export function sanitizeRedirectTo(value: string | null): string {
  if (!value) return "/"
  if (!value.startsWith("/") || value.startsWith("//")) return "/"
  return value
}

/** Loader guard: redirects to `/login` with a `redirectTo` back to the page
 * that was requested if unauthenticated, otherwise returns a bearer token for
 * forwarding to the backend. */
export async function requireToken(args: LoaderFunctionArgs): Promise<string> {
  const { isAuthenticated, getToken } = await getAuth(args)
  const token = isAuthenticated ? await getToken() : null
  if (!token) {
    const url = new URL(args.request.url)
    const path = url.pathname + url.search
    throw redirect(`/login?redirectTo=${encodeURIComponent(path)}`)
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
