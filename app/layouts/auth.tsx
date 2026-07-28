import { Outlet } from "react-router"
import { RouteErrorCard } from "~/components/route-error-card"
import type { Route } from "./+types/auth"

export default function Layout() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Outlet />
    </div>
  )
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return (
    <RouteErrorCard
      error={error}
      title="Something went wrong"
      fallbackDetails="We couldn't load this page. Try again or head back home."
      backTo="/"
      backLabel="Back to home"
    />
  )
}
