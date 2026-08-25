import { Navigate } from "react-router"
import type { MutationResult } from "~/lib/action-results"
import { deleteSeparation } from "~/lib/api"
import { getAuthToken } from "~/lib/auth-client"
import type { Route } from "./+types/delete-separation"

export async function clientAction(
  args: Route.ClientActionArgs
): Promise<MutationResult> {
  try {
    await deleteSeparation(args.params.separationId, await getAuthToken())
    return { ok: true, id: args.params.separationId }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}

// See create-separation.tsx — this is a fetcher-only action target;
// redirect direct navigation to the list instead of a blank content area.
export default function Component() {
  return <Navigate to="/classrooms" replace />
}
