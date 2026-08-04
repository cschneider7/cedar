import type { MutationResult } from "~/lib/action-results"
import { deleteStudent } from "~/lib/api"
import { tokenFromRequest } from "~/lib/auth"
import type { Route } from "./+types/delete-student"

export async function action(args: Route.ActionArgs): Promise<MutationResult> {
  try {
    await deleteStudent(args.params.studentId, await tokenFromRequest(args))
    return { ok: true, id: args.params.studentId }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
