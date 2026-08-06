import { getAuth } from "@clerk/react-router/server"
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MiddlewareFunction,
} from "react-router"
import { redirect } from "react-router"

/** Route/layout middleware: redirects to `/login` if unauthenticated,
 * otherwise lets the request continue to the matched loader/action. Runs
 * for both loaders and actions under the route it's attached to, so a
 * single `middleware = [requireAuth]` on a layout gates its whole subtree
 * (including action-only routes) without each one needing its own guard. */
export const requireAuth: MiddlewareFunction<Response | void> = async (
  args,
  next
) => {
  const { isAuthenticated, getToken } = await getAuth(args)
  const token = isAuthenticated ? await getToken() : null
  if (!token) {
    throw redirect("/login")
  }
  return next()
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
