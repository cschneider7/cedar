import {
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
} from "react-router"
import { Spinner } from "~/components/ui/spinner"

import { AppSidebar } from "~/components/app-sidebar"
import { AppTopbar } from "~/components/app-topbar"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar"
import { Toaster } from "~/components/ui/sonner"
import { ThemeProvider } from "~/components/ui/theme-provider"
import { TooltipProvider } from "~/components/ui/tooltip"
import { getClassrooms, getCurrentUser } from "~/lib/api"
import { cookieFromRequest } from "~/lib/auth"
import type { Route } from "./+types/root"
import "./app.css"

export async function loader({ request }: Route.LoaderArgs) {
  const cookie = cookieFromRequest(request)
  const user = await getCurrentUser(cookie)
  // Anonymous visitors (public pages like `/`, `/login`) have no session to
  // scope a classroom list to, and `/api/v1/classrooms` now 401s without one.
  const classrooms = user ? await getClassrooms(cookie) : []
  return { user, classrooms }
}

export function HydrateFallback() {
  return (
    <div id="loading-splash">
      <Spinner className="size-8" />
      <p>Loading, please wait...</p>
    </div>
  )
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Must stay in sync with ThemeProvider's logic below. Runs before render to avoid a light->dark flash on load. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function () {
              try {
                var storageKey = "vite-ui-theme";
                var resolved = localStorage.getItem(storageKey) || "light";
                if (resolved === "system") {
                  resolved = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
                }
                document.documentElement.classList.remove("light", "dark");
                document.documentElement.classList.add(resolved);
                document.documentElement.style.colorScheme = resolved;
              } catch (e) {}
            })();`,
          }}
        />
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  return (
    <TooltipProvider delay={200}>
      <div className="flex h-dvh flex-col overflow-hidden [--header-height:calc(--spacing(14))]">
        <SidebarProvider className="min-h-0 flex-1 flex-col">
          <AppTopbar />
          <div className="flex min-h-0 flex-1">
            <AppSidebar />
            <SidebarInset className="min-h-0">
              <Outlet />
            </SidebarInset>
          </div>
        </SidebarProvider>
      </div>
    </TooltipProvider>
  )
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!"
  let details = "An unexpected error occurred."
  let stack: string | undefined

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error"
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message
    stack = error.stack
  }

  return (
    <main className="mx-auto w-full max-w-md p-4 pt-16">
      <Card className="relative mx-auto w-full sm:max-w-md">
        <CardHeader>
          <CardTitle>{message}</CardTitle>
          <CardDescription>{details}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" render={<Link to="/">Back to home</Link>} />
        </CardFooter>
        {stack && (
          <CardContent>
            <pre className="w-full overflow-x-auto p-4 text-xs">
              <code>{stack}</code>
            </pre>
          </CardContent>
        )}
      </Card>
    </main>
  )
}
