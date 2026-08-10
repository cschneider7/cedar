import { Monitor, Moon, Sun } from "lucide-react"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { useTheme, type Theme } from "~/components/ui/theme-provider"

export const themeIcons = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system"
}

/** Standalone theme switcher for contexts without a signed-in account menu
 * (e.g. signed-out visitors) — same options as the account menu's "Theme"
 * submenu, shared via `themeIcons`/`isTheme`. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const ThemeIcon = themeIcons[theme]

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
          value={theme}
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
