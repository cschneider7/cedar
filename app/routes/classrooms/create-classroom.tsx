import { Navigate } from "react-router"
import type { MutationResult } from "~/lib/action-results"
import { createClassroom } from "~/lib/api"
import { tokenFromRequest } from "~/lib/auth"
import { CreateClassroomSchema } from "~/lib/schemas"
import type { Route } from "./+types/create-classroom"

export async function action(args: Route.ActionArgs): Promise<MutationResult> {
  const rawData = await args.request.json()
  const result = CreateClassroomSchema.safeParse(rawData)

  if (!result.success) {
    return { ok: false, error: "Please check the form and try again." }
  }

  try {
    const classroom = await createClassroom(
      result.data,
      await tokenFromRequest(args)
    )
    return { ok: true, id: classroom.id }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}

// This route is a loader/action target hit via useFetcher from
// ClassroomFormDialog, which never navigates here directly. A direct GET
// (bookmark, refresh mid-flow, shared link) would otherwise render the
// classrooms layout with a blank content area — redirect to the list.
export default function Component() {
  return <Navigate to="/classrooms" replace />
}
