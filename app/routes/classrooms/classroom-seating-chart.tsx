import { SeatingChartCanvas } from "~/components/seating-chart/seating-chart-canvas"
import { updateClassroomSeatingChart } from "~/lib/api"
import { getAccessToken } from "~/lib/supabase/token"
import { useClassroomData } from "~/lib/classroom-route-data"
import { SeatingChartSchema } from "~/lib/schemas"
import type { Route } from "./+types/classroom-seating-chart"

export async function action(args: Route.ActionArgs) {
  const rawData = await args.request.json()
  const result = SeatingChartSchema.safeParse(rawData)

  if (!result.success) {
    return { ok: false, error: "Please check the seating chart and try again." }
  }

  try {
    await updateClassroomSeatingChart(
      args.params.classroomId,
      result.data,
      await getAccessToken(args.context)
    )
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }

  return { ok: true }
}

export default function Component() {
  const { classroom, seatingChart, students } = useClassroomData()
  return (
    <SeatingChartCanvas
      classroomId={classroom.id}
      seatingChart={seatingChart}
      students={students}
    />
  )
}
