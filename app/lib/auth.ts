import { getAuth } from "@clerk/react-router/server"
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MiddlewareFunction,
} from "react-router"
import { redirect } from "react-router"

/**
 * Route/layout middleware: redirects to `/login` if unauthenticated. Gates
 * the whole subtree it's attached to, including action-only routes.
 * @param args - The loader/action args for the current request.
 * @param next - Continues to the next middleware/handler in the chain.
 * @returns Whatever `next()` resolves to.
 */
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

/**
 * Action-only helper: no redirect, just best-effort token forwarding — the
 * backend's own 401 is the source of truth for these mutation-only routes.
 * @param args - The loader/action args for the current request.
 * @returns The session token, or `undefined` if unauthenticated.
 */
export async function tokenFromRequest(
  args: LoaderFunctionArgs | ActionFunctionArgs
): Promise<string | undefined> {
  const { getToken } = await getAuth(args)
  return (await getToken()) ?? undefined
}
