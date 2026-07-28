import type { MutationResult } from "~/lib/action-results"
import { getClassrooms, updateStudent } from "~/lib/api"
import { cookieFromRequest, requireUser } from "~/lib/auth"
import { UpdateStudentSchema } from "~/lib/schemas"
import type { Route } from "./+types/edit-student"

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request)
  const classrooms = await getClassrooms(cookieFromRequest(request))
  return { classrooms: classrooms }
}

export async function action({
  params,
  request,
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
      cookieFromRequest(request)
    )
    return { ok: true, id: params.studentId }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
