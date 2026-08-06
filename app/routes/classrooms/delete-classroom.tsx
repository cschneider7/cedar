import type { MutationResult } from "~/lib/action-results"
import { deleteClassroom } from "~/lib/api"
import { tokenFromRequest } from "~/lib/auth"
import type { Route } from "./+types/delete-classroom"

export async function action(args: Route.ActionArgs): Promise<MutationResult> {
  try {
    await deleteClassroom(args.params.classroomId, await tokenFromRequest(args))
    return { ok: true, id: args.params.classroomId }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
