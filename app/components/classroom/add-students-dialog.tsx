import { PlusIcon } from "lucide-react"
import { useState } from "react"
import { useRevalidator } from "react-router"
import { StudentAvatar } from "~/components/student-avatar"
import { StudentFormDialog } from "~/components/student-form-dialog"
import { Alert, AlertDescription } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Empty, EmptyDescription, EmptyTitle } from "~/components/ui/empty"
import { ScrollArea } from "~/components/ui/scroll-area"
import { Spinner } from "~/components/ui/spinner"
import { toast } from "~/components/ui/toast"
import type { Student } from "~/lib/schemas"

/**
 * Multi-select picker for adding existing students (unassigned or from
 * another classroom) onto this classroom's roster.
 */
export function AddStudentsDialog({
  open,
  onOpenChange,
  classroomId,
  eligibleStudents,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  classroomId: string
  eligibleStudents: Student[]
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const revalidator = useRevalidator()

  function handleOpenChange(next: boolean) {
    if (next) {
      setSelectedIds(new Set())
      setError(null)
    }
    onOpenChange(next)
  }

  function toggle(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  async function handleConfirm() {
    setIsSubmitting(true)
    setError(null)
    const results = await Promise.allSettled(
      Array.from(selectedIds).map((id) =>
        fetch(`/students/${id}/edit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classroom_id: classroomId }),
        }).then((response) => {
          if (!response.ok) {
            throw new Error(`Failed to add student ${id}`)
          }
        })
      )
    )
    setIsSubmitting(false)
    // Loaders may have stale data even for the successful requests above —
    // fetch() bypasses React Router's own fetcher-based revalidation.
    await revalidator.revalidate()
    const failed = results.filter((r) => r.status === "rejected").length
    if (failed > 0) {
      setError(`Failed to add ${failed} of ${selectedIds.size} student(s).`)
      return
    }
    toast.add({
      title: `Added ${selectedIds.size} student${selectedIds.size === 1 ? "" : "s"}`,
      type: "success",
    })
    handleOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="select-none sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Students</DialogTitle>
          <DialogDescription>
            Select students to add to the classroom roster.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {eligibleStudents.length === 0 ? (
          <Empty>
            <EmptyTitle>No students to add</EmptyTitle>
            <EmptyDescription>
              All students are already assigned to this classroom.
            </EmptyDescription>
          </Empty>
        ) : (
          <ScrollArea className="h-64 rounded-md border">
            <div className="flex flex-col gap-1 p-2">
              {eligibleStudents.map((student) => (
                <label
                  key={student.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selectedIds.has(student.id)}
                    onCheckedChange={(checked) =>
                      toggle(student.id, checked === true)
                    }
                  />
                  <StudentAvatar
                    student={student}
                    className="size-6 shrink-0 rounded-full text-[9px]"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {student.name}
                  </span>
                </label>
              ))}
            </div>
          </ScrollArea>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="sm:mr-auto"
            onClick={() => setCreateOpen(true)}
          >
            <PlusIcon /> New Student
          </Button>
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            type="button"
            disabled={selectedIds.size === 0 || isSubmitting}
            onClick={handleConfirm}
          >
            {isSubmitting && <Spinner />}
            Add {selectedIds.size > 0 ? selectedIds.size : ""}
          </Button>
        </DialogFooter>
        <StudentFormDialog
          mode="create"
          defaultClassroomId={classroomId}
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      </DialogContent>
    </Dialog>
  )
}
