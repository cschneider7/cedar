import { Navigate } from "react-router"
import type { MutationResult } from "~/lib/action-results"
import { createClassroom } from "~/lib/api"
import { getAccessToken } from "~/lib/supabase/token"
import { CreateClassroomSchema } from "~/lib/schemas"
import type { Route } from "./+types/create-classroom"

export async function action({
  request,
  context,
}: Route.ActionArgs): Promise<MutationResult> {
  const rawData = await request.json()
  const result = CreateClassroomSchema.safeParse(rawData)

  if (!result.success) {
    return { ok: false, error: "Please check the form and try again." }
  }

  try {
    const classroom = await createClassroom(
      result.data,
      await getAccessToken(context)
    )
    return { ok: true, id: classroom.id }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}

// This is a fetcher-only action target — a direct GET (bookmark, refresh)
// would otherwise render a blank content area, so redirect to the list.
export default function Component() {
  return <Navigate to="/classrooms" replace />
}
