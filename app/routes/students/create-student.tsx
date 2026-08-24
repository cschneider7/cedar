import { Navigate } from "react-router"
import type { MutationResult } from "~/lib/action-results"
import { createStudent, getClassrooms } from "~/lib/api"
import { getBearerToken } from "~/lib/auth-client"
import { CreateStudentSchema } from "~/lib/schemas"
import type { Route } from "./+types/create-student"

export async function clientLoader() {
  const token = await getBearerToken()
  const classrooms = await getClassrooms(token)
  return { classrooms: classrooms }
}

// This is a fetcher-only action target — a direct GET (bookmark, refresh)
// would otherwise render a blank content area, so redirect to the list.
export default function Component() {
  return <Navigate to="/students" replace />
}

export async function clientAction({
  request,
}: Route.ClientActionArgs): Promise<MutationResult> {
  const rawData = await request.json()
  const result = CreateStudentSchema.safeParse(rawData)

  if (!result.success) {
    return { ok: false, error: "Please check the form and try again." }
  }

  try {
    const student = await createStudent(result.data, await getBearerToken())
    return { ok: true, id: student.id }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
