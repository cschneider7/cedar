import { Link, isRouteErrorResponse, useRevalidator } from "react-router"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"

/** Generic Card-styled fallback for a route's `ErrorBoundary` export. */
export function RouteErrorCard({
  error,
  title,
  fallbackDetails,
  backTo,
  backLabel,
  showRetry = true,
}: {
  error: unknown
  title: string
  fallbackDetails: string
  backTo: string
  backLabel: string
  showRetry?: boolean
}) {
  let details = fallbackDetails
  let stack: string | undefined
  const revalidator = useRevalidator()

  if (isRouteErrorResponse(error)) {
    details = error.statusText || details
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message
    stack = error.stack
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <Card className="relative mx-auto w-full sm:max-w-md" size="sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{details}</CardDescription>
        </CardHeader>
        <CardFooter className="gap-2">
          {showRetry && (
            <Button
              disabled={revalidator.state !== "idle"}
              onClick={() => revalidator.revalidate()}
            >
              Try again
            </Button>
          )}
          <Button
            variant="outline"
            render={<Link to={backTo}>{backLabel}</Link>}
          />
        </CardFooter>
        {stack && (
          <CardContent>
            <pre className="w-full overflow-x-auto p-4 text-xs">
              <code>{stack}</code>
            </pre>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
