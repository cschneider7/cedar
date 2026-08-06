import { SeatingChartCanvas } from "~/components/seating-chart/seating-chart-canvas"
import { Separator } from "~/components/ui/separator"
import {
  getClassroom,
  getClassroomSeatingChart,
  getStudents,
  updateClassroomSeatingChart,
} from "~/lib/api"
import { tokenFromRequest } from "~/lib/auth"
import type { BreadcrumbHandle } from "~/lib/breadcrumb"
import type { SeatingChart } from "~/lib/schemas"
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
  const [classroom, seatingChart, allStudents] = await Promise.all([
    getClassroom(params.classroomId, token),
    getClassroomSeatingChart(params.classroomId, token),
    getStudents(token),
  ])
  const students = allStudents.filter((s) => s.classroom_id === classroom.id)
  return { classroom, students, seatingChart }
}

export async function action(args: Route.ActionArgs) {
  const chart: SeatingChart = await args.request.json()

  try {
    await updateClassroomSeatingChart(
      args.params.classroomId,
      chart,
      await tokenFromRequest(args)
    )
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }

  return { ok: true }
}

export default function Component({ loaderData }: Route.ComponentProps) {
  const { classroom, students, seatingChart } = loaderData

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
