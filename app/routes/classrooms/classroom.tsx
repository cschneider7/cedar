import { useEffect } from "react"
import { SeatingChartCanvas } from "~/components/seating-chart/seating-chart-canvas"
import { Separator } from "~/components/ui/separator"
import { useRecentClassrooms } from "~/hooks/use-recent-classrooms"
import {
  getClassroom,
  getClassroomSeatingChart,
  getStudents,
  toRouteError,
  updateClassroomSeatingChart,
} from "~/lib/api"
import { tokenFromRequest } from "~/lib/auth"
import type { BreadcrumbHandle } from "~/lib/breadcrumb"
import { SeatingChartSchema } from "~/lib/schemas"
import type { Route } from "./+types/classroom"

export const handle: BreadcrumbHandle = {
  breadcrumb: (data: Route.ComponentProps["loaderData"] | undefined) =>
    data ? `Period ${data.classroom.period} — ${data.classroom.subject}` : "",
  to: (data: Route.ComponentProps["loaderData"] | undefined) =>
    data ? `/classrooms/${data.classroom.id}` : "/classrooms",
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Classrooms" },
    { name: "description", content: "Seating chart app" },
  ]
}

export async function loader(args: Route.LoaderArgs) {
  const token = await tokenFromRequest(args)
  const { params } = args
  // Unlike other loaders here, failures are NOT degraded gracefully — a
  // seating chart can't render meaningfully with a partial roster/chart.
  try {
    const [classroom, seatingChart, allStudents] = await Promise.all([
      getClassroom(params.classroomId, token),
      getClassroomSeatingChart(params.classroomId, token),
      getStudents(token),
    ])
    const students = allStudents.filter((s) => s.classroom_id === classroom.id)
    return { classroom, students, seatingChart }
  } catch (error) {
    toRouteError(error)
  }
}

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
      await tokenFromRequest(args)
    )
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }

  return { ok: true }
}

export default function Component({ loaderData }: Route.ComponentProps) {
  const { classroom, students, seatingChart } = loaderData
  const [, addRecent] = useRecentClassrooms()

  useEffect(() => {
    addRecent(classroom.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroom.id])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3">
        <h2 className="text-lg">Period {classroom.period}</h2>
        <Separator
          orientation="vertical"
          className="hidden sm:block data-vertical:h-4 data-vertical:self-auto"
        />
        <h3 className="text-lg font-light">{classroom.subject}</h3>
      </div>
      <SeatingChartCanvas
        classroomId={classroom.id}
        seatingChart={seatingChart}
        students={students}
      />
    </div>
  )
}
