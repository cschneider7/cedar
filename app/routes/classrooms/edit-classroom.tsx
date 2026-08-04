import type { MutationResult } from "~/lib/action-results"
import { updateClassroom } from "~/lib/api"
import { tokenFromRequest } from "~/lib/auth"
import { UpdateClassroomSchema } from "~/lib/schemas"
import type { Route } from "./+types/edit-classroom"

export async function action(
  args: Route.ActionArgs
): Promise<MutationResult> {
  const { params, request } = args
  const rawData = await request.json()
  const result = UpdateClassroomSchema.safeParse(rawData)

  if (!result.success) {
    return { ok: false, error: "Please check the form and try again." }
  }

  try {
    await updateClassroom(
      params.classroomId,
      result.data,
      await tokenFromRequest(args)
    )
    return { ok: true, id: params.classroomId }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
