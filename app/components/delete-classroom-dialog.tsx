import { Trash2Icon } from "lucide-react"
import { useEffect } from "react"
import { useFetcher, useLocation, useNavigate } from "react-router"
import { toast } from "sonner"
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
} from "~/components/ui/alert-dialog"
import { Spinner } from "~/components/ui/spinner"
import type { MutationResult } from "~/lib/action-results"
import type { Classroom } from "~/lib/schemas"

export function DeleteClassroomDialog({
  classroom,
  open,
  onOpenChange,
}: {
  classroom: Classroom
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const deleteFetcher = useFetcher<MutationResult>()
  const isDeleting = deleteFetcher.state !== "idle"
  const deleteError =
    deleteFetcher.data && !deleteFetcher.data.ok
      ? deleteFetcher.data.error
      : null

  useEffect(() => {
    if (deleteFetcher.state === "idle" && deleteFetcher.data?.ok) {
      onOpenChange(false)
      toast.success("Classroom deleted")
      if (location.pathname.startsWith(`/classrooms/${classroom.id}`)) {
        navigate("/classrooms")
      }
    }
  }, [deleteFetcher.state, deleteFetcher.data])

  function handleDelete() {
    deleteFetcher.submit(null, {
      method: "post",
      action: `/classrooms/${classroom.id}/delete`,
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>
            Delete Period {classroom.period} - {classroom.subject}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the classroom and cannot be undone. Are
            you sure you want to continue?
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
  )
}
