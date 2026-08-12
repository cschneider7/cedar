import * as z from "zod"
import { bulkDeleteStudents } from "~/lib/api"
import { tokenFromRequest } from "~/lib/auth"
import type { Route } from "./+types/bulk-delete-students"

const BulkDeleteInputSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
})

export async function action(args: Route.ActionArgs) {
  const rawData = await args.request.json()
  const result = BulkDeleteInputSchema.safeParse(rawData)

  if (!result.success) {
    return { ok: false, error: "Please check your selection and try again." }
  }

  try {
    await bulkDeleteStudents(result.data.ids, await tokenFromRequest(args))
    return { ok: true }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
