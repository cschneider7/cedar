import type { ColumnDef } from "@tanstack/react-table"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import { useEffect, useState } from "react"
import { useFetcher } from "react-router"
import { toast } from "sonner"
import { StudentAvatar } from "~/components/student-avatar"
import { StudentFormDialog } from "~/components/student-form-dialog"
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
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { Spinner } from "~/components/ui/spinner"
import type { MutationResult } from "~/lib/action-results"
import type { Classroom, Student } from "~/lib/schemas"

export type StudentSortKey = "name" | "student_id" | "classroom"
export type StudentSortDir = "asc" | "desc"

function SortableHeader({
  label,
  sortKey,
  sortBy,
  sortDir,
  onSortChange,
}: {
  label: string
  sortKey: StudentSortKey
  sortBy: StudentSortKey
  sortDir: StudentSortDir
  onSortChange: (key: StudentSortKey) => void
}) {
  const isActive = sortBy === sortKey
  const Icon = isActive
    ? sortDir === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown

  return (
    <button
      type="button"
      className="flex items-center gap-1 font-medium"
      onClick={() => onSortChange(sortKey)}
    >
      {label}
      <Icon
        className={isActive ? "size-3.5" : "size-3.5 text-muted-foreground"}
      />
    </button>
  )
}

function ActionsCell({ student }: { student: Student }) {
  const [editOpen, setEditOpen] = useState(false)
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
      toast.success("Student deleted")
    }
  }, [deleteFetcher.state, deleteFetcher.data])

  function handleDelete() {
    deleteFetcher.submit(null, {
      method: "post",
      action: `/students/${student.id}/delete`,
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${student.name}`}
            >
              <MoreHorizontalIcon />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <PencilIcon />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2Icon />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <StudentFormDialog
        mode="edit"
        student={student}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete {student.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the student and cannot be undone. Are
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
    </>
  )
}

export function getStudentColumns({
  classroomById,
  sortBy,
  sortDir,
  onSortChange,
}: {
  classroomById: Map<string, Classroom>
  sortBy: StudentSortKey
  sortDir: StudentSortDir
  onSortChange: (key: StudentSortKey) => void
}): ColumnDef<Student>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={
            table.getIsSomePageRowsSelected() &&
            !table.getIsAllPageRowsSelected()
          }
          onCheckedChange={(checked) =>
            table.toggleAllPageRowsSelected(checked)
          }
          onClick={(e) => e.stopPropagation()}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(checked) => row.toggleSelected(checked)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${row.original.name}`}
        />
      ),
      enableSorting: false,
    },
    {
      id: "avatar",
      header: "",
      cell: ({ row }) => (
        <StudentAvatar student={row.original} className="size-8 rounded-full" />
      ),
      enableSorting: false,
    },
    {
      accessorKey: "name",
      header: () => (
        <SortableHeader
          label="Name"
          sortKey="name"
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={onSortChange}
        />
      ),
      cell: ({ row }) => row.original.name,
    },
    {
      accessorKey: "student_id",
      header: () => (
        <SortableHeader
          label="Student ID"
          sortKey="student_id"
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={onSortChange}
        />
      ),
      cell: ({ row }) => row.original.student_id,
    },
    {
      id: "classroom",
      header: () => (
        <SortableHeader
          label="Classroom"
          sortKey="classroom"
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={onSortChange}
        />
      ),
      cell: ({ row }) => {
        const classroom = row.original.classroom_id
          ? classroomById.get(row.original.classroom_id)
          : undefined
        return classroom ? (
          <Badge variant="secondary">Period {classroom.period}</Badge>
        ) : (
          <Badge variant="outline">Unassigned</Badge>
        )
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => <ActionsCell student={row.original} />,
      enableSorting: false,
    },
  ]
}
