import { bulkDeleteStudents } from "~/lib/api"
import { tokenFromRequest } from "~/lib/auth"
import type { Route } from "./+types/bulk-delete-students"

export async function action(args: Route.ActionArgs) {
  const { ids }: { ids: string[] } = await args.request.json()

  try {
    await bulkDeleteStudents(ids, await tokenFromRequest(args))
    return { ok: true }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
