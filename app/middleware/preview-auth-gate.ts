import { data, type MiddlewareFunction } from "react-router"

/**
 * Route-level middleware refusing sign-up/reset-password/OAuth-linking on
 * Vercel Preview deployments — enforced server-side (not just hidden in
 * the UI) so a direct POST to these routes still refuses. Preview and
 * Production share one Supabase project (see the migration spec), so this
 * is the only thing stopping Preview from mutating auth state that's
 * visible in Production.
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

/** Whether the current deployment is a Vercel Preview — for cosmetic UI gating (hiding buttons/links) alongside the server-side middleware above. */
export function isPreviewEnv(): boolean {
  return process.env.VERCEL_ENV === "preview"
}
