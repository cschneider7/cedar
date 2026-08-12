import { ClipboardList, Plus } from "lucide-react"
import { useEffect } from "react"
import { Link } from "react-router"
import { toast } from "sonner"
import { ClassroomFormDialog } from "~/components/classroom-form-dialog"
import { DeleteClassroomDialog } from "~/components/delete-classroom-dialog"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { getClassrooms, getStudents } from "~/lib/api"
import { tokenFromRequest } from "~/lib/auth"
import type { Classroom, Student } from "~/lib/schemas"
import type { Route } from "./+types/classroom-home"

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Classrooms" },
    { name: "description", content: "Seating chart app" },
  ]
}

export async function loader(args: Route.LoaderArgs) {
  const token = await tokenFromRequest(args)
  const [classrooms, studentsResult] = await Promise.all([
    getClassrooms(token),
    // Student counts are supplementary — a failure here degrades to "—"
    // counts + a toast rather than failing the whole page.
    getStudents(token).then(
      (students) => ({ students, failed: false }),
      () => ({ students: [] as Student[], failed: true })
    ),
  ])
  const studentCounts = new Map<string, number>()
  for (const student of studentsResult.students) {
    if (!student.classroom_id) continue
    studentCounts.set(
      student.classroom_id,
      (studentCounts.get(student.classroom_id) ?? 0) + 1
    )
  }
  return {
    classrooms,
    studentCounts: Object.fromEntries(studentCounts),
    studentsError: studentsResult.failed,
  }
}

function EmptyClassrooms() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ClipboardList />
        </EmptyMedia>
        <EmptyTitle>No Classrooms Yet</EmptyTitle>
        <EmptyDescription>
          You haven&apos;t created any classrooms yet. Get started by creating
          your first classroom.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center gap-2">
        <ClassroomFormDialog
          mode="create"
          trigger={<Button>Create classroom</Button>}
        />
      </EmptyContent>
    </Empty>
  )
}

function ClassroomSummary({
  classroom,
  studentCount,
}: {
  classroom: Classroom
  studentCount: number | null
}) {
  return (
    <Card className="w-full" size="sm">
      <CardHeader>
        <CardAction>
          <Badge variant="secondary">Period {classroom.period}</Badge>
        </CardAction>
        <CardTitle>{classroom.subject}</CardTitle>
        <CardDescription>
          {studentCount === null
            ? "— students"
            : `${studentCount} ${studentCount === 1 ? "student" : "students"}`}
        </CardDescription>
      </CardHeader>
      <CardFooter className="justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          render={<Link to={`/classrooms/${classroom.id}`}>View</Link>}
        />
        <ClassroomFormDialog
          mode="edit"
          classroom={classroom}
          trigger={
            <Button size="sm" variant="outline">
              Edit
            </Button>
          }
        />
        <DeleteClassroomDialog
          classroom={classroom}
          trigger={
            <Button size="sm" variant="destructive">
              Delete
            </Button>
          }
        />
      </CardFooter>
    </Card>
  )
}

export default function Component({ loaderData }: Route.ComponentProps) {
  const { classrooms, studentCounts, studentsError } = loaderData

  useEffect(() => {
    if (studentsError) {
      toast.warning("Couldn't load student counts.")
    }
  }, [studentsError])

  return (
    <>
      {classrooms.length === 0 ? (
        <EmptyClassrooms />
      ) : (
        <div>
          <ClassroomFormDialog
            mode="create"
            trigger={
              <Button className="mb-4">
                <Plus />
                <span>Create classroom</span>
              </Button>
            }
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {classrooms.map((classroom) => (
              <div key={classroom.id} className="flex max-w-full flex-col">
                <ClassroomSummary
                  classroom={classroom}
                  studentCount={
                    studentsError ? null : (studentCounts[classroom.id] ?? 0)
                  }
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
