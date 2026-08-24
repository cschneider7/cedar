import type { Route } from "./+types/students"

import { Outlet } from "react-router"
import { RequireAuth } from "~/components/require-auth"
import { RouteErrorCard } from "~/components/route-error-card"
import type { BreadcrumbHandle } from "~/lib/breadcrumb"

export const handle: BreadcrumbHandle = {
  breadcrumb: () => "Students",
  to: "/students",
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Students" },
    {
      name: "description",
      content: "Cedar — organize classrooms and seating charts.",
    },
  ]
}

export default function Layout() {
  return (
    <RequireAuth>
      <div className="h-full min-h-0 overflow-y-auto px-10 py-8">
        <Outlet />
      </div>
    </RequireAuth>
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
