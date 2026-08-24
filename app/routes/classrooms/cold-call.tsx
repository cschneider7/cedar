import { useOutletContext } from "react-router"
import { ColdCallTab } from "~/components/classroom/cold-call-tab"
import { pickColdCallStudent } from "~/lib/api"
import { getBearerToken } from "~/lib/auth-client"
import type { ClassroomOutletContext } from "~/routes/classrooms/classroom"
import { useClassroomData } from "~/lib/classroom-route-data"
import type { ColdCallPick } from "~/lib/schemas"
import type { Route } from "./+types/cold-call"

export type ColdCallActionResult =
  { ok: true; pick: ColdCallPick } | { ok: false; error: string }

export async function clientAction(
  args: Route.ClientActionArgs
): Promise<ColdCallActionResult> {
  const payload = await args.request.json()

  try {
    const pick = await pickColdCallStudent(
      args.params.classroomId,
      payload,
      await getBearerToken()
    )
    return { ok: true, pick }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}

export default function Component() {
  const { classroom, students } = useClassroomData()
  const { coldCallWeights, setColdCallWeights } =
    useOutletContext<ClassroomOutletContext>()
  return (
    <ColdCallTab
      classroomId={classroom.id}
      students={students}
      weights={coldCallWeights}
      onWeightsChange={setColdCallWeights}
    />
  )
}
