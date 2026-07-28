import { redirect } from "react-router"
import { getCurrentUser } from "~/lib/api"
import type { User } from "~/lib/schemas"

/** Returns the incoming request's `Cookie` header, for forwarding to the
 * backend from a server-side (loader/action) `fetch` call. */
export function cookieFromRequest(request: Request): string | undefined {
  return request.headers.get("cookie") ?? undefined
}

/** Loader guard: returns the current user or throws a redirect to `/login`
 * with a `redirectTo` back to the page that was requested. */
export async function requireUser(request: Request): Promise<User> {
  const cookie = cookieFromRequest(request)
  const user = await getCurrentUser(cookie)
  if (!user) {
    const path = new URL(request.url).pathname + new URL(request.url).search
    throw redirect(`/login?redirectTo=${encodeURIComponent(path)}`)
  }
  return user
}
