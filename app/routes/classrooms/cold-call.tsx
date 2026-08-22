import { useOutletContext } from "react-router"
import { ColdCallTab } from "~/components/classroom/cold-call-tab"
import { pickColdCallStudent } from "~/lib/api"
import { tokenFromRequest } from "~/lib/auth"
import type { ClassroomOutletContext } from "~/routes/classrooms/classroom"
import { useClassroomData } from "~/lib/classroom-route-data"
import type { ColdCallPick } from "~/lib/schemas"
import type { Route } from "./+types/cold-call"

export type ColdCallActionResult =
  { ok: true; pick: ColdCallPick } | { ok: false; error: string }

export async function action(
  args: Route.ActionArgs
): Promise<ColdCallActionResult> {
  const payload = await args.request.json()

  try {
    const pick = await pickColdCallStudent(
      args.params.classroomId,
      payload,
      await tokenFromRequest(args)
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
