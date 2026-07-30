import type { Route } from "./+types/students"

import { Outlet } from "react-router"
import { RouteErrorCard } from "~/components/route-error-card"
import { requireUser } from "~/lib/auth"
import type { BreadcrumbHandle } from "~/lib/breadcrumb"

export const handle: BreadcrumbHandle = {
  breadcrumb: () => "Students",
  to: "/students",
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Students" },
    { name: "description", content: "Seating chart app" },
  ]
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request)
}

export default function Layout() {
  return (
    <div className="h-full min-h-0 overflow-y-auto px-10 py-8">
      <Outlet />
    </div>
  )
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return (
    <RouteErrorCard
      error={error}
      title="Something went wrong"
      fallbackDetails="We couldn't load this page. Try again or head back to the student list."
      backTo="/students"
      backLabel="Back to students"
    />
  )
}
