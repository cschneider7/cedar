import { useState } from "react"
import { DeleteConfirmDialog } from "~/components/delete-confirm-dialog"
import { useDeleteResource } from "~/hooks/use-delete-resource"
import { formatClassroomName } from "~/lib/classroom-term"
import type { Classroom } from "~/lib/schemas"

/**
 * Confirmation dialog that deletes a classroom via `useDeleteResource`.
 */
export function DeleteClassroomDialog({
  classroom,
  trigger,
  open,
  onOpenChange,
}: {
  classroom: Classroom
  trigger?: React.ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const isOpen = open ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen

  const { isDeleting, error, submit } = useDeleteResource({
    successMessage: "Classroom deleted",
    onDeleted: () => setOpen(false),
    navigateTo: "/classrooms",
    onlyIfViewing: `/classrooms/${classroom.id}`,
  })

  function handleDelete() {
    submit(null, {
      method: "post",
      action: `/classrooms/${classroom.id}/delete`,
    })
  }

  return (
    <DeleteConfirmDialog
      trigger={trigger}
      open={isOpen}
      onOpenChange={setOpen}
      title={`Delete ${formatClassroomName(classroom)}?`}
      description="This will permanently delete the classroom and cannot be undone. Are you sure you want to continue?"
      isDeleting={isDeleting}
      error={error}
      onConfirm={handleDelete}
    />
  )
}
