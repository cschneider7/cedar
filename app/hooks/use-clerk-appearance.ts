import { dark } from "@clerk/themes"
import type { ClerkAppearanceTheme } from "@clerk/shared/types"
import { useEffect, useState } from "react"
import { useTheme } from "~/components/ui/theme-provider"

/** Resolves the app's light/dark/system theme (useTheme) to Clerk's
 * appearance prop, client-side only to avoid a hydration mismatch — mirrors
 * the same resolution algorithm as root.tsx's pre-hydration <script> and
 * ThemeProvider's own useEffect; keep all three in sync by hand. */
export function useClerkAppearance(): ClerkAppearanceTheme {
  const { theme } = useTheme()
  const [resolvedDark, setResolvedDark] = useState(false)

  useEffect(() => {
    setResolvedDark(
      theme === "dark" ||
        (theme === "system" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches)
    )
  }, [theme])

  return {
    theme: resolvedDark ? dark : undefined,
    variables: {
      colorPrimary: "var(--primary)",
      colorBackground: "var(--card)",
      colorForeground: "var(--card-foreground)",
      colorMutedForeground: "var(--muted-foreground)",
      borderRadius: "var(--radius)",
    },
  }
}
