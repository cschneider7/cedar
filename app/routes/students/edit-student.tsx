import { Navigate } from "react-router"
import type { MutationResult } from "~/lib/action-results"
import { getClassrooms, updateStudent } from "~/lib/api"
import { tokenFromRequest } from "~/lib/auth"
import { UpdateStudentSchema } from "~/lib/schemas"
import type { Route } from "./+types/edit-student"

export async function loader(args: Route.LoaderArgs) {
  const token = await tokenFromRequest(args)
  const classrooms = await getClassrooms(token)
  return { classrooms: classrooms }
}

// See create-student.tsx — this is a fetcher-only loader/action target;
// redirect direct navigation to the list instead of a blank content area.
export default function Component() {
  return <Navigate to="/students" replace />
}

export async function action(args: Route.ActionArgs): Promise<MutationResult> {
  const { params, request } = args
  const rawData = await request.json()
  const result = UpdateStudentSchema.safeParse(rawData)

  if (!result.success) {
    return { ok: false, error: "Please check the form and try again." }
  }

  try {
    await updateStudent(
      params.studentId,
      result.data,
      await tokenFromRequest(args)
    )
    return { ok: true, id: params.studentId }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
