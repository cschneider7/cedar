import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"

export type Theme = "light" | "dark" | "system"

export const themeIcons = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const

/**
 * Type guard for a valid `Theme` value.
 * @param value - The value to check.
 * @returns Whether `value` is a valid `Theme`.
 */
export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system"
}

/**
 * Standalone theme switcher for contexts without a signed-in account menu
 * (e.g. signed-out visitors).
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  // next-themes only knows the real theme once mounted (it's undefined on
  // the server and on the first client render, by design) — fall back to a
  // stable icon until then so this doesn't itself cause a hydration mismatch.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const ThemeIcon = mounted && isTheme(theme) ? themeIcons[theme] : Monitor

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="icon" aria-label="Change theme">
            <ThemeIcon />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={mounted && isTheme(theme) ? theme : "system"}
          onValueChange={(value) => {
            if (isTheme(value)) setTheme(value)
          }}
        >
          <DropdownMenuRadioItem value="light" closeOnClick>
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" closeOnClick>
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" closeOnClick>
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
