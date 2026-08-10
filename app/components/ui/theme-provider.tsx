import { createContext, useContext, useEffect, useState } from "react"

export type Theme = "dark" | "light" | "system"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = "light",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  // Always starts at `defaultTheme`, matching the SSR-rendered output —
  // reading localStorage here (as this used to) makes the client's first
  // render disagree with the server's for any descendant whose output
  // depends on `theme` (e.g. a Sun/Moon icon), triggering a React hydration
  // mismatch. The real stored value is synced in immediately after mount
  // instead, once hydration has already completed.
  const [theme, setTheme] = useState<Theme>(defaultTheme)

  useEffect(() => {
    const stored = localStorage.getItem(storageKey) as Theme | null
    if (stored && stored !== theme) {
      setTheme(stored)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const root = window.document.documentElement

    function applyTheme(t: Theme) {
      root.classList.remove("light", "dark")
      if (t === "system") {
        const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
          .matches
          ? "dark"
          : "light"
        root.classList.add(systemTheme)
        return
      }
      root.classList.add(t)
    }

    applyTheme(theme)

    if (theme !== "system") {
      return
    }

    // Keep a "system" selection live: reflect an OS theme change made while
    // the tab stays open, not just at the next mount/reload.
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => applyTheme("system")
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [theme])

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme)
      setTheme(theme)
    },
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider")

  return context
}
