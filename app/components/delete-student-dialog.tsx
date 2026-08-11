import { useState } from "react"
import { DeleteConfirmDialog } from "~/components/delete-confirm-dialog"
import { useDeleteResource } from "~/hooks/use-delete-resource"
import type { Student } from "~/lib/schemas"

/**
 * Confirmation dialog that deletes a student via `useDeleteResource`.
 */
export function DeleteStudentDialog({
  student,
  trigger,
  open,
  onOpenChange,
  navigateOnDelete = false,
}: {
  student: Student
  trigger?: React.ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Navigate back to the student list on success — for callers rendered
   * on the student's own detail page, which won't exist to return to. */
  navigateOnDelete?: boolean
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const isOpen = open ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen

  const { isDeleting, error, submit } = useDeleteResource({
    successMessage: "Student deleted",
    onDeleted: () => setOpen(false),
    navigateTo: navigateOnDelete ? "/students" : undefined,
  })

  function handleDelete() {
    submit(null, {
      method: "post",
      action: `/students/${student.id}/delete`,
    })
  }

  return (
    <DeleteConfirmDialog
      trigger={trigger}
      open={isOpen}
      onOpenChange={setOpen}
      title={`Delete ${student.name}?`}
      description="This will permanently delete the student and cannot be undone. Are you sure you want to continue?"
      isDeleting={isDeleting}
      error={error}
      onConfirm={handleDelete}
    />
  )
}
