import { Alert, AlertDescription } from "~/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog"
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

import { ArrowLeft, Trash2Icon } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useFetcher, useNavigate } from "react-router"
import { StudentFormDialog } from "~/components/student-form-dialog"
import { Spinner } from "~/components/ui/spinner"
import type { MutationResult } from "~/lib/action-results"
import { getClassroom, getStudent } from "~/lib/api"
import { tokenFromRequest } from "~/lib/auth"
import type { BreadcrumbHandle } from "~/lib/breadcrumb"
import type { Route } from "./+types/student"

export const handle: BreadcrumbHandle = {
  breadcrumb: (data: Route.ComponentProps["loaderData"] | undefined) =>
    data ? data.student.name : "",
  to: (data: Route.ComponentProps["loaderData"] | undefined) =>
    data ? `/students/${data.student.id}` : "/students",
}

export async function loader(args: Route.LoaderArgs) {
  const token = await tokenFromRequest(args)
  const { params } = args
  const student = await getStudent(params.studentId, token)
  const classroom = student.classroom_id
    ? await getClassroom(student.classroom_id, token)
    : null

  return {
    student: student,
    classroom: classroom,
  }
}

export default function Component({ loaderData }: Route.ComponentProps) {
  const { student, classroom } = loaderData
  const navigate = useNavigate()
  const [deleteOpen, setDeleteOpen] = useState(false)

  const deleteFetcher = useFetcher<MutationResult>()
  const isDeleting = deleteFetcher.state !== "idle"
  const deleteError =
    deleteFetcher.data && !deleteFetcher.data.ok
      ? deleteFetcher.data.error
      : null

  useEffect(() => {
    if (deleteFetcher.state === "idle" && deleteFetcher.data?.ok) {
      navigate("/students")
    }
  }, [deleteFetcher.state, deleteFetcher.data])

  function handleDelete() {
    deleteFetcher.submit(null, {
      method: "post",
      action: `/students/${student.id}/delete`,
    })
  }

  return (
    <div className="justify-center">
      <div className="mx-auto mb-4 w-full max-w-sm">
        <Button variant="link" size="sm" render={<Link to="/students" />}>
          <ArrowLeft />
          Back to Students
        </Button>
      </div>
      <Card className="relative mx-auto w-full max-w-sm pt-0">
        <div className="absolute inset-0 z-30 aspect-video bg-black/35" />
        <img
          src={`https://avatar.vercel.sh/${student.id}`}
          alt="Student image"
          className="relative z-20 aspect-video w-full object-cover brightness-60 grayscale dark:brightness-40"
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
                      Period {classroom.period}
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
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogTrigger
              render={<Button variant="destructive">Delete</Button>}
            />
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
                  <Trash2Icon />
                </AlertDialogMedia>
                <AlertDialogTitle>Delete {student.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the student and cannot be undone.
                  Are you sure you want to continue?
                </AlertDialogDescription>
              </AlertDialogHeader>
              {deleteError && (
                <Alert variant="destructive">
                  <AlertDescription>{deleteError}</AlertDescription>
                </Alert>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel variant="outline">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={isDeleting}
                  onClick={handleDelete}
                >
                  {isDeleting && <Spinner />}
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardFooter>
      </Card>
    </div>
  )
}
