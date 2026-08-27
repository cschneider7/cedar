import { Navigate } from "react-router"
import type { MutationResult } from "~/lib/action-results"
import { updateClassroom } from "~/lib/api"
import { getAccessToken } from "~/lib/supabase/token"
import { UpdateClassroomSchema } from "~/lib/schemas"
import type { Route } from "./+types/edit-classroom"

export async function action({
  params,
  request,
  context,
}: Route.ActionArgs): Promise<MutationResult> {
  const rawData = await request.json()
  const result = UpdateClassroomSchema.safeParse(rawData)

  if (!result.success) {
    return { ok: false, error: "Please check the form and try again." }
  }

  try {
    await updateClassroom(
      params.classroomId,
      result.data,
      await getAccessToken(context)
    )
    return { ok: true, id: params.classroomId }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}

// See create-classroom.tsx — this is a fetcher-only action target;
// redirect direct navigation to the list instead of a blank content area.
export default function Component() {
  return <Navigate to="/classrooms" replace />
}
