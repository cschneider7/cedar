import * as z from "zod"
import { updateStudent } from "~/lib/api"
import { tokenFromRequest } from "~/lib/auth"
import type { Route } from "./+types/bulk-unassign-students"

const BulkUnassignInputSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
})

export async function action(args: Route.ActionArgs) {
  const rawData = await args.request.json()
  const result = BulkUnassignInputSchema.safeParse(rawData)

  if (!result.success) {
    return { ok: false, error: "Please check your selection and try again." }
  }

  const token = await tokenFromRequest(args)

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
