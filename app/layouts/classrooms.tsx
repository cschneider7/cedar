import { RedirectToSignIn, SignedIn } from "@neondatabase/auth/react"
import { Outlet } from "react-router"
import { RouteErrorCard } from "~/components/route-error-card"
import type { BreadcrumbHandle } from "~/lib/breadcrumb"
import type { Route } from "./+types/classrooms"

export const handle: BreadcrumbHandle = {
  breadcrumb: () => "Classrooms",
  to: "/classrooms",
}

export default function Layout() {
  return (
    <>
      <RedirectToSignIn />
      <SignedIn>
        <div className="flex h-full p-6">
          <main className="w-full">
            <Outlet />
          </main>
        </div>
      </SignedIn>
    </>
  )
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return (
    <RouteErrorCard
      error={error}
      title="Something went wrong"
      fallbackDetails="We couldn't load this page. Try again or head back to the classroom list."
      backTo="/classrooms"
      backLabel="Back to classrooms"
    />
  )
}
