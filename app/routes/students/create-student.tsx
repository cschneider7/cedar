import { Navigate } from "react-router"
import type { MutationResult } from "~/lib/action-results"
import { createStudent, getClassrooms } from "~/lib/api"
import { getAccessToken } from "~/lib/supabase/token"
import { CreateStudentSchema } from "~/lib/schemas"
import type { Route } from "./+types/create-student"

export async function loader({ context }: Route.LoaderArgs) {
  const token = await getAccessToken(context)
  const classrooms = await getClassrooms(token)
  return { classrooms: classrooms }
}

// This is a fetcher-only action target — a direct GET (bookmark, refresh)
// would otherwise render a blank content area, so redirect to the list.
export default function Component() {
  return <Navigate to="/students" replace />
}

export async function action({
  request,
  context,
}: Route.ActionArgs): Promise<MutationResult> {
  const rawData = await request.json()
  const result = CreateStudentSchema.safeParse(rawData)

  if (!result.success) {
    return { ok: false, error: "Please check the form and try again." }
  }

  try {
    const student = await createStudent(
      result.data,
      await getAccessToken(context)
    )
    return { ok: true, id: student.id }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
