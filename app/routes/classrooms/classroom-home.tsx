import { ClipboardList, Plus, Trash2Icon } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useFetcher, useNavigate } from "react-router"
import { toast } from "sonner"
import { ClassroomFormDialog } from "~/components/classroom-form-dialog"
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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Spinner } from "~/components/ui/spinner"
import type { MutationResult } from "~/lib/action-results"
import { getClassrooms, getStudents } from "~/lib/api"
import { tokenFromRequest } from "~/lib/auth"
import type { Classroom } from "~/lib/schemas"
import type { Route } from "./+types/classroom-home"

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Classrooms" },
    { name: "description", content: "Seating chart app" },
  ]
}

export async function loader(args: Route.LoaderArgs) {
  const token = await tokenFromRequest(args)
  const [classrooms, students] = await Promise.all([
    getClassrooms(token),
    getStudents(token),
  ])
  const studentCounts = new Map<string, number>()
  for (const student of students) {
    if (!student.classroom_id) continue
    studentCounts.set(
      student.classroom_id,
      (studentCounts.get(student.classroom_id) ?? 0) + 1
    )
  }
  return { classrooms, studentCounts: Object.fromEntries(studentCounts) }
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
  studentCount: number
}) {
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
      setDeleteOpen(false)
      toast.success("Classroom deleted")
      navigate("/classrooms")
    }
  }, [deleteFetcher.state, deleteFetcher.data])

  function handleDelete() {
    deleteFetcher.submit(null, {
      method: "post",
      action: `/classrooms/${classroom.id}/delete`,
    })
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardAction>
          <Badge variant="secondary">Period {classroom.period}</Badge>
        </CardAction>
        <CardTitle>{classroom.subject}</CardTitle>
        <CardDescription>
          {studentCount} {studentCount === 1 ? "student" : "students"}
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
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogTrigger
            render={
              <Button size="sm" variant="destructive">
                Delete
              </Button>
            }
          />
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
                <Trash2Icon />
              </AlertDialogMedia>
              <AlertDialogTitle>
                Delete Period {classroom.period} - {classroom.subject}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the classroom and cannot be undone.
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
  )
}

export default function Component({ loaderData }: Route.ComponentProps) {
  const { classrooms, studentCounts } = loaderData
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {classrooms.map((classroom) => (
              <div key={classroom.id} className="flex max-w-full flex-col">
                <ClassroomSummary
                  classroom={classroom}
                  studentCount={studentCounts[classroom.id] ?? 0}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
