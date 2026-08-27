import { data, type MiddlewareFunction } from "react-router"

/**
 * Route-level middleware refusing sign-up/reset-password/OAuth-linking on
 * Vercel Preview deployments
 */
export const previewAuthGateMiddleware: MiddlewareFunction<Response> = (
  {},
  next
) => {
  if (process.env.VERCEL_ENV === "preview") {
    throw data(
      { message: "This action isn't available on preview deployments." },
      { status: 403 }
    )
  }
  return next()
}

/**
 * Whether the current deployment is a Vercel Preview
 */
export function isPreviewEnv(): boolean {
  return process.env.VERCEL_ENV === "preview"
}
