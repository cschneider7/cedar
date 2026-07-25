import { ArrowLeftIcon } from "lucide-react"
import { Link } from "react-router"
import { SeatingChartCanvas } from "~/components/seating-chart/seating-chart-canvas"
import { Button } from "~/components/ui/button"
import {
  getClassroom,
  getClassroomSeatingChart,
  getStudents,
  updateClassroomSeatingChart,
} from "~/lib/api"
import type { SeatingChart } from "~/lib/schemas"
import type { Route } from "./+types/classroom"

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Classrooms" },
    { name: "description", content: "Seating chart app" },
  ]
}

export async function loader({ params }: Route.ClientLoaderArgs) {
  const [classroom, seatingChart, allStudents] = await Promise.all([
    getClassroom(params.classroomId),
    getClassroomSeatingChart(params.classroomId),
    getStudents(),
  ])
  const students = allStudents.filter((s) => s.classroom_id === classroom.id)
  return { classroom, students, seatingChart }
}

export async function action({ params, request }: Route.ActionArgs) {
  const chart: SeatingChart = await request.json()

  try {
    await updateClassroomSeatingChart(params.classroomId, chart)
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }

  return { ok: true }
}

export default function Component({ loaderData }: Route.ComponentProps) {
  const { classroom, students, seatingChart } = loaderData

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0">
        <Button
          variant="link"
          size="sm"
          className="mb-1 px-0 text-muted-foreground"
          render={<Link to="/classrooms" />}
        >
          <ArrowLeftIcon />
          <span>Classrooms</span>
        </Button>
        <h2 className="text-2xl font-medium">Period {classroom.period}</h2>
        <h3 className="text-sm text-muted-foreground">{classroom.subject}</h3>
      </div>
      <SeatingChartCanvas
        classroomId={classroom.id}
        seatingChart={seatingChart}
        students={students}
      />
    </div>
  )
}
