import { ClerkProvider } from "@clerk/react-router"
import { clerkMiddleware, rootAuthLoader } from "@clerk/react-router/server"
import {
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useRevalidator,
} from "react-router"
import { Spinner } from "~/components/ui/spinner"

import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Toaster } from "~/components/ui/sonner"
import { ThemeProvider } from "~/components/ui/theme-provider"
import { TooltipProvider } from "~/components/ui/tooltip"
import { getClassrooms } from "~/lib/api"
import type { Route } from "./+types/root"
import "./app.css"

export const middleware: Route.MiddlewareFunction[] = [clerkMiddleware()]

export const links: Route.LinksFunction = () => [
  { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
]

export async function loader(args: Route.LoaderArgs) {
  return rootAuthLoader(args, async ({ request }) => {
    const { isAuthenticated, getToken } = request.auth
    // Anonymous visitors (public pages like `/`) have no session to scope a
    // classroom list to, and `/api/v1/classrooms` now 401s without one.
    if (!isAuthenticated) {
      return { classrooms: [], classroomsError: false }
    }
    // This loader runs on every navigation/revalidation — a transient
    // failure here must not take down the whole shell, so degrade instead.
    try {
      const classrooms = await getClassrooms(await getToken())
      return { classrooms, classroomsError: false }
    } catch {
      return { classrooms: [], classroomsError: true }
    }
  })
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

export default function App({ loaderData }: Route.ComponentProps) {
  return (
    <ClerkProvider loaderData={loaderData}>
      <TooltipProvider delay={200}>
        <div className="flex h-dvh flex-col overflow-hidden [--header-height:calc(--spacing(14))]">
          <Outlet />
        </div>
      </TooltipProvider>
    </ClerkProvider>
  )
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!"
  let details = "An unexpected error occurred."
  let stack: string | undefined
  const isNotFound = isRouteErrorResponse(error) && error.status === 404
  const revalidator = useRevalidator()

  if (isRouteErrorResponse(error)) {
    message = isNotFound ? "404" : "Error"
    details = isNotFound
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
        <CardFooter className="gap-2">
          {!isNotFound && (
            <Button
              disabled={revalidator.state !== "idle"}
              onClick={() => revalidator.revalidate()}
            >
              Try again
            </Button>
          )}
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
