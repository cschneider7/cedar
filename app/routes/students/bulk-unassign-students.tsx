import * as z from "zod"
import { updateStudent } from "~/lib/api"
import { getAccessToken } from "~/lib/supabase/token"
import type { Route } from "./+types/bulk-unassign-students"

const BulkUnassignInputSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
})

export async function action({ request, context }: Route.ActionArgs) {
  const rawData = await request.json()
  const result = BulkUnassignInputSchema.safeParse(rawData)

  if (!result.success) {
    return { ok: false, error: "Please check your selection and try again." }
  }

  const token = await getAccessToken(context)

  try {
    await Promise.all(
      result.data.ids.map((id) =>
        updateStudent(id, { classroom_id: null }, token)
      )
    )
    return { ok: true }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
