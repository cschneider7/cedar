import { bulkDeleteStudents } from "~/lib/api"
import { cookieFromRequest } from "~/lib/auth"
import type { Route } from "./+types/bulk-delete-students"

export async function action({ request }: Route.ActionArgs) {
  const { ids }: { ids: string[] } = await request.json()

  try {
    await bulkDeleteStudents(ids, cookieFromRequest(request))
    return { ok: true }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
