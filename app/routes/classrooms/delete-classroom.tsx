import type { MutationResult } from "~/lib/action-results"
import { deleteClassroom } from "~/lib/api"
import { cookieFromRequest } from "~/lib/auth"
import type { Route } from "./+types/delete-classroom"

export async function action({
  params,
  request,
}: Route.ActionArgs): Promise<MutationResult> {
  try {
    await deleteClassroom(params.classroomId, cookieFromRequest(request))
    return { ok: true, id: params.classroomId }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
