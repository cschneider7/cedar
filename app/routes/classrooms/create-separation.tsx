import { Navigate } from "react-router"
import { createSeparation } from "~/lib/api"
import { getAuthToken } from "~/lib/auth-client"
import { CreateSeparationSchema, type Separation } from "~/lib/schemas"
import type { Route } from "./+types/create-separation"

export type CreateSeparationResult =
  { ok: true; separation: Separation } | { ok: false; error: string }

// This is a fetcher-only action target — a direct GET (bookmark, refresh)
// would otherwise render a blank content area, so redirect to the list.
export default function Component() {
  return <Navigate to="/classrooms" replace />
}

export async function clientAction({
  request,
}: Route.ClientActionArgs): Promise<CreateSeparationResult> {
  const rawData = await request.json()
  const result = CreateSeparationSchema.safeParse(rawData)

  if (!result.success) {
    return { ok: false, error: "Please choose two different students." }
  }

  try {
    const separation = await createSeparation(result.data, await getAuthToken())
    return { ok: true, separation }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
