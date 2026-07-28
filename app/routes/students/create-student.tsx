import type { MutationResult } from "~/lib/action-results"
import { createStudent, getClassrooms } from "~/lib/api"
import { cookieFromRequest, requireUser } from "~/lib/auth"
import { CreateStudentSchema } from "~/lib/schemas"
import type { Route } from "./+types/create-student"

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request)
  const classrooms = await getClassrooms(cookieFromRequest(request))
  return { classrooms: classrooms }
}

export async function action({
  request,
}: Route.ActionArgs): Promise<MutationResult> {
  const rawData = await request.json()
  const result = CreateStudentSchema.safeParse(rawData)

  if (!result.success) {
    return { ok: false, error: "Please check the form and try again." }
  }

  try {
    const student = await createStudent(result.data, cookieFromRequest(request))
    return { ok: true, id: student.id }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
