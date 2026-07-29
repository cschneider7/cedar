import { pickColdCallStudent } from "~/lib/api"
import { cookieFromRequest } from "~/lib/auth"
import type { ColdCallPick } from "~/lib/schemas"
import type { Route } from "./+types/cold-call"

export type ColdCallActionResult =
  { ok: true; pick: ColdCallPick } | { ok: false; error: string }

export async function action({
  params,
  request,
}: Route.ActionArgs): Promise<ColdCallActionResult> {
  const payload = await request.json()

  try {
    const pick = await pickColdCallStudent(
      params.classroomId,
      payload,
      cookieFromRequest(request)
    )
    return { ok: true, pick }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
