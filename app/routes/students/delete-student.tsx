import { Navigate } from "react-router"
import type { MutationResult } from "~/lib/action-results"
import { deleteStudent } from "~/lib/api"
import { getBearerToken } from "~/lib/auth-client"
import type { Route } from "./+types/delete-student"

export async function clientAction(
  args: Route.ClientActionArgs
): Promise<MutationResult> {
  try {
    await deleteStudent(args.params.studentId, await getBearerToken())
    return { ok: true, id: args.params.studentId }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}

// See create-student.tsx — this is a fetcher-only action target; redirect
// direct navigation to the list instead of a blank content area.
export default function Component() {
  return <Navigate to="/students" replace />
}
