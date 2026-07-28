import type { MutationResult } from "~/lib/action-results"
import { createClassroom } from "~/lib/api"
import { cookieFromRequest } from "~/lib/auth"
import { CreateClassroomSchema } from "~/lib/schemas"
import type { Route } from "./+types/create-classroom"

export async function action({
  request,
}: Route.ActionArgs): Promise<MutationResult> {
  const rawData = await request.json()
  const result = CreateClassroomSchema.safeParse(rawData)

  if (!result.success) {
    return { ok: false, error: "Please check the form and try again." }
  }

  try {
    const classroom = await createClassroom(
      result.data,
      cookieFromRequest(request)
    )
    return { ok: true, id: classroom.id }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
