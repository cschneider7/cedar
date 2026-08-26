import type { ReactNode } from "react"
import { ThemeToggle } from "~/components/theme-toggle"
import { Wordmark } from "~/components/wordmark"

/**
 * Shared chrome for the pre-auth pages (login/signup/forgot-password/
 * reset-password/email-verification/sign-out)
 * @param props - `children` (typically an `AuthView`) to render inside.
 */
export function AuthPageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-6 p-6">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Wordmark textClassName="font-medium" />
      {children}
    </div>
  )
}
