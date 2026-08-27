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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"

import { ArrowLeft } from "lucide-react"
import { Link } from "react-router"
import { DeleteStudentDialog } from "~/components/delete-student-dialog"
import { RouteHydrateFallback } from "~/components/route-hydrate-fallback"
import { StudentAvatar } from "~/components/student-avatar"
import { StudentFormDialog } from "~/components/student-form-dialog"
import { getClassroom, getStudent, toRouteError } from "~/lib/api"
import { getAccessToken } from "~/lib/supabase/token"
import type { BreadcrumbHandle } from "~/lib/breadcrumb"
import { formatClassroomName } from "~/lib/classroom-term"
import type { Route } from "./+types/student"

export const handle: BreadcrumbHandle = {
  breadcrumb: (data: Route.ComponentProps["loaderData"] | undefined) =>
    data ? data.student.name : "",
  to: (data: Route.ComponentProps["loaderData"] | undefined) =>
    data ? `/students/${data.student.id}` : "/students",
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const token = await getAccessToken(context)

  try {
    const student = await getStudent(params.studentId, token)
    const classroom = student.classroom_id
      ? await getClassroom(student.classroom_id, token)
      : null

    return {
      student: student,
      classroom: classroom,
    }
  } catch (error) {
    toRouteError(error)
  }
}

export function HydrateFallback() {
  return <RouteHydrateFallback />
}

export default function Component({ loaderData }: Route.ComponentProps) {
  const { student, classroom } = loaderData

  return (
    <div className="justify-center">
      <div className="mx-auto mb-4 w-full max-w-sm">
        <Button variant="link" size="sm" render={<Link to="/students" />}>
          <ArrowLeft />
          Back to Students
        </Button>
      </div>
      <Card className="mx-auto w-full max-w-sm pt-0">
        <StudentAvatar
          student={student}
          className="aspect-square w-full text-6xl"
        />
        <CardHeader>
          <CardAction>
            {classroom ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Badge
                      variant="secondary"
                      render={<Link to={`/classrooms/${classroom.id}`} />}
                    >
                      {formatClassroomName(classroom)}
                    </Badge>
                  }
                />
                <TooltipContent>Go to classroom</TooltipContent>
              </Tooltip>
            ) : (
              <Badge variant="outline">Unassigned</Badge>
            )}
          </CardAction>
          <CardTitle>{student.name}</CardTitle>
          <CardDescription>Student ID: {student.student_id}</CardDescription>
        </CardHeader>
        <CardFooter className="justify-end gap-2">
          <StudentFormDialog
            mode="edit"
            student={student}
            trigger={<Button variant="outline">Edit</Button>}
          />
          <DeleteStudentDialog
            student={student}
            navigateOnDelete
            trigger={<Button variant="destructive">Delete</Button>}
          />
        </CardFooter>
      </Card>
    </div>
  )
}
