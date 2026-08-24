import { Spinner } from "~/components/ui/spinner"

/**
 * Shared `HydrateFallback` for routes that moved from a server `loader` to a
 * `clientLoader` as part of the Neon Auth migration — those routes have no
 * SSR data on first paint, so React Router renders this until the
 * `clientLoader` resolves during hydration.
 * @returns A centered spinner filling the available space.
 */
export function RouteHydrateFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner className="size-8" />
    </div>
  )
}
