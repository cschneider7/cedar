import { NeonAuthUIProvider } from "@neondatabase/auth-ui"
import { SpeedInsights } from "@vercel/speed-insights/react"
import { ThemeProvider } from "next-themes"
import { useCallback } from "react"
import {
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useNavigate,
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
import { Toaster } from "~/components/ui/toast"
import { TooltipProvider } from "~/components/ui/tooltip"
import { authClient } from "~/lib/auth-client"
import type { Route } from "./+types/root"
import "./app.css"

export const links: Route.LinksFunction = () => [
  { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
]

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
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          storageKey="vite-ui-theme"
        >
          {children}
          <Toaster />
        </ThemeProvider>
        <ScrollRestoration />
        <Scripts />
        <SpeedInsights />
      </body>
    </html>
  )
}

export default function App() {
  const navigate = useNavigate()

  const handleNavigate = useCallback(
    (href: string) => navigate(href),
    [navigate]
  )
  const handleReplace = useCallback(
    (href: string) => navigate(href, { replace: true }),
    [navigate]
  )

  const handleLink = useCallback(
    ({
      href,
      className,
      children,
    }: {
      href: string
      className?: string
      children: React.ReactNode
    }) => (
      <Link to={href} className={className}>
        {children}
      </Link>
    ),
    []
  )

  return (
    <TooltipProvider delay={200}>
      <NeonAuthUIProvider
        authClient={authClient}
        emailVerification={{ otp: true }}
        navigate={handleNavigate}
        replace={handleReplace}
        Link={handleLink}
      >
        <div className="flex h-dvh flex-col overflow-hidden [--header-height:calc(--spacing(14))]">
          <Outlet />
        </div>
      </NeonAuthUIProvider>
    </TooltipProvider>
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
