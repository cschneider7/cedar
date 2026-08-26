import { Spinner } from "~/components/ui/spinner"

/**
 * Shared `HydrateFallback` for routes
 * @returns A centered spinner filling the available space.
 */
export function RouteHydrateFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner className="size-8" />
    </div>
  )
}
