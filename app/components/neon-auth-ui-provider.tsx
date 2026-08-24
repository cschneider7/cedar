import type { ReactNode } from "react"
import { Link as RouterLink, useNavigate } from "react-router"
import { AuthUIProvider } from "@neondatabase/auth-ui"
import { authClient } from "~/lib/auth-client"

/**
 * Configures `@daveyplate/better-auth-ui`'s provider to fit this app's
 * actual route shape (flat `/login`/`/signup`/`/account`, not the library's
 * default `/auth/*` catch-all convention) and to navigate via React Router
 * instead of full page reloads. Scoped to just the auth-adjacent pages that
 * render `auth-ui` components, not the whole app — those pages own their
 * own mount/unmount of this provider.
 *
 * Deliberately uses `AuthUIProvider` directly rather than
 * `@neondatabase/auth-ui`'s `NeonAuthUIProvider` wrapper — that wrapper
 * force-mounts its own independent `next-themes` `ThemeProvider`
 * (`attribute="class"`), which fights this app's own hand-rolled
 * `ThemeProvider` for control of `<html>`'s class attribute (both write to
 * it). That's what caused login/account's dark-mode setting not to persist:
 * `next-themes` had no knowledge of this app's `vite-ui-theme` localStorage
 * key and would reassert its own (default "system") theme on mount/re-render,
 * undoing whatever this app's `ThemeProvider` had just set. Skipping the
 * wrapper leaves `<html>`'s class controlled by exactly one system;
 * auth-ui's own CSS already inherits this app's theme via its `--neon-*`
 * variable fallbacks (see `app.css`'s `@neondatabase/auth-ui/tailwind`
 * import), so no replacement theming is needed. The one accepted tradeoff:
 * auth-ui's internal `sonner` toasts (e.g. "check your email" on
 * forgot-password) render by system preference rather than this app's
 * chosen theme, since they'd otherwise need their own `next-themes` context
 * — a minor, low-visibility inconsistency next to the page-level bug this
 * fixes.
 * @param props - `children` to render inside the provider.
 * @returns The provider wrapping `children`.
 */
export function NeonAuthUI({ children }: { children: ReactNode }) {
  const navigate = useNavigate()

  return (
    <AuthUIProvider
      authClient={authClient}
      redirectTo="/"
      changeEmail={false}
      account={{ fields: ["name"] }}
      basePath=""
      viewPaths={{ SIGN_IN: "login", SIGN_UP: "signup" }}
      emailVerification={{ otp: true }}
      navigate={(href) => navigate(href)}
      replace={(href) => navigate(href, { replace: true })}
      Link={({ href, className, children: linkChildren }) => (
        <RouterLink to={href} className={className}>
          {linkChildren}
        </RouterLink>
      )}
      magicLink={false}
      multiSession={false}
      apiKey={false}
      passkey={false}
      oneTap={false}
    >
      {children}
    </AuthUIProvider>
  )
}
