import { cn } from "~/lib/utils"

// App icon
function Logomark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-5 shrink-0", className)}
      fill="#3B7254"
      aria-hidden="true"
    >
      <circle cx="12.4" cy="13" r="5.9" />
      <circle cx="19.6" cy="13" r="5.9" />
      <circle cx="16" cy="9.4" r="5.9" />
      <rect x="14.2" y="15" width="3.6" height="12" rx="1.7" />
    </svg>
  )
}

/**
 * App icon and name
 */
export function Wordmark({
  className,
  textClassName,
}: {
  className?: string
  textClassName?: string
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-2 select-none", className)}
    >
      <Logomark />
      <span className={cn("font-heading", textClassName)}>Cedar</span>
    </span>
  )
}
