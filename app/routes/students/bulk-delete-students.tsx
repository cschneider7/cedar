import * as z from "zod"
import { bulkDeleteStudents } from "~/lib/api"
import { getAccessToken } from "~/lib/supabase/token"
import type { Route } from "./+types/bulk-delete-students"

const BulkDeleteInputSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
})

export async function action({ request, context }: Route.ActionArgs) {
  const rawData = await request.json()
  const result = BulkDeleteInputSchema.safeParse(rawData)

  if (!result.success) {
    return { ok: false, error: "Please check your selection and try again." }
  }

  try {
    await bulkDeleteStudents(result.data.ids, await getAccessToken(context))
    return { ok: true }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
