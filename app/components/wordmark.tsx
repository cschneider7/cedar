import { cn } from "~/lib/utils"

function Logomark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-5 shrink-0", className)}
      aria-hidden="true"
    >
      <rect
        x="5"
        y="1"
        width="6"
        height="6"
        rx="1.5"
        fill="var(--muted-foreground)"
        fillOpacity="0.5"
      />
      <rect
        x="13"
        y="1"
        width="6"
        height="6"
        rx="1.5"
        fill="var(--muted-foreground)"
        fillOpacity="0.5"
      />
      <rect
        x="5"
        y="9"
        width="6"
        height="6"
        rx="1.5"
        fill="var(--muted-foreground)"
        fillOpacity="0.5"
      />
      <rect x="13" y="9" width="6" height="6" rx="1.5" fill="var(--primary)" />
      <rect
        x="5"
        y="17"
        width="6"
        height="6"
        rx="1.5"
        fill="var(--muted-foreground)"
        fillOpacity="0.5"
      />
      <rect
        x="13"
        y="17"
        width="6"
        height="6"
        rx="1.5"
        fill="var(--muted-foreground)"
        fillOpacity="0.5"
      />
    </svg>
  )
}

/**
 * The app's wordmark: a small logomark (one filled seat in a 2x3 grid) next
 * to the "Cedar" name. Used in the sidebar, topbar, and auth pages.
 */
export function Wordmark({
  className,
  textClassName,
}: {
  className?: string
  textClassName?: string
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Logomark />
      <span className={cn("font-heading", textClassName)}>Cedar</span>
    </span>
  )
}
