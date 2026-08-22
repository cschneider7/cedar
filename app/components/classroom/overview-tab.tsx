import { ArrowUpRightIcon } from "lucide-react"
import { Link } from "react-router"
import { StudentAvatar } from "~/components/student-avatar"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import type { SeatingChart, Student } from "~/lib/schemas"
import { SeatingChartPreview } from "./seating-chart-preview"

const AVATAR_DISPLAY_CAP = 16

/**
 * Read-only summary of the classroom: roster/table stat cards (each linking
 * to the tab that manages it) plus a static preview of the seating chart.
 */
export function OverviewTab({
  classroomId,
  students,
  seatingChart,
}: {
  classroomId: string
  students: Student[]
  seatingChart: SeatingChart
}) {
  const visibleStudents = students.slice(0, AVATAR_DISPLAY_CAP)
  const overflowCount = students.length - visibleStudents.length

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Students
              <Badge variant="secondary" className="select-none">
                {students.length}
              </Badge>
            </CardTitle>
            <CardAction>
              <Button
                variant="link"
                render={<Link to={`/classrooms/${classroomId}/roster`} />}
              >
                Manage Roster
                <ArrowUpRightIcon data-icon="inline-end" />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="select-none">
            {students.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No students on this classroom's roster yet.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {visibleStudents.map((student) => (
                  <StudentAvatar
                    key={student.id}
                    student={student}
                    className="size-9 rounded-full text-xs"
                  />
                ))}
                {overflowCount > 0 && (
                  <div
                    aria-hidden="true"
                    className="flex size-9 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
                  >
                    +{overflowCount}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Tables</CardTitle>
            <CardAction>
              <Button
                variant="link"
                render={
                  <Link to={`/classrooms/${classroomId}/seating-chart`} />
                }
              >
                Manage Seating Chart
                <ArrowUpRightIcon data-icon="inline-end" />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {seatingChart.tables.length}
          </CardContent>
        </Card>
      </div>
      <SeatingChartPreview
        seatingChart={seatingChart}
        students={students}
        classroomId={classroomId}
      />
    </div>
  )
}
