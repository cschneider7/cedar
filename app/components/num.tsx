import { cn } from "~/lib/utils"

/**
 * Wraps any numeral that carries real meaning (period numbers, seat/student
 * counts, pagination ranges, dashboard stats) in IBM Plex Mono with tabular
 * figures — the design spec's one deliberate visual signature.
 */
export function Num({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("font-mono tabular-nums", className)} {...props} />
}
