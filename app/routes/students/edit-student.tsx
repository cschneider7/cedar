import { Navigate } from "react-router"
import type { MutationResult } from "~/lib/action-results"
import { getClassrooms, updateStudent } from "~/lib/api"
import { getAccessToken } from "~/lib/supabase/token"
import { UpdateStudentSchema } from "~/lib/schemas"
import type { Route } from "./+types/edit-student"

export async function loader({ context }: Route.LoaderArgs) {
  const token = await getAccessToken(context)
  const classrooms = await getClassrooms(token)
  return { classrooms: classrooms }
}

// See create-student.tsx — this is a fetcher-only loader/action target;
// redirect direct navigation to the list instead of a blank content area.
export default function Component() {
  return <Navigate to="/students" replace />
}

export async function action({
  params,
  request,
  context,
}: Route.ActionArgs): Promise<MutationResult> {
  const rawData = await request.json()
  const result = UpdateStudentSchema.safeParse(rawData)

  if (!result.success) {
    return { ok: false, error: "Please check the form and try again." }
  }

  try {
    await updateStudent(
      params.studentId,
      result.data,
      await getAccessToken(context)
    )
    return { ok: true, id: params.studentId }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
