import { Navigate } from "react-router"
import type { MutationResult } from "~/lib/action-results"
import { createStudent, getClassrooms } from "~/lib/api"
import { tokenFromRequest } from "~/lib/auth"
import { CreateStudentSchema } from "~/lib/schemas"
import type { Route } from "./+types/create-student"

export async function loader(args: Route.LoaderArgs) {
  const token = await tokenFromRequest(args)
  const classrooms = await getClassrooms(token)
  return { classrooms: classrooms }
}

// This route is a loader/action target hit via useFetcher from
// StudentFormDialog, which never navigates here directly (no component gets
// rendered on a fetcher submit/load). A direct GET (bookmark, refresh
// mid-flow, shared link) would otherwise render the students layout with a
// blank content area — redirect to the list instead.
export default function Component() {
  return <Navigate to="/students" replace />
}

export async function action(args: Route.ActionArgs): Promise<MutationResult> {
  const rawData = await args.request.json()
  const result = CreateStudentSchema.safeParse(rawData)

  if (!result.success) {
    return { ok: false, error: "Please check the form and try again." }
  }

  try {
    const student = await createStudent(
      result.data,
      await tokenFromRequest(args)
    )
    return { ok: true, id: student.id }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
