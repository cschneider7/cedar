import { Navigate } from "react-router"
import type { MutationResult } from "~/lib/action-results"
import { deleteStudent } from "~/lib/api"
import { getAccessToken } from "~/lib/supabase/token"
import type { Route } from "./+types/delete-student"

export async function action(args: Route.ActionArgs): Promise<MutationResult> {
  try {
    await deleteStudent(
      args.params.studentId,
      await getAccessToken(args.context)
    )
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
