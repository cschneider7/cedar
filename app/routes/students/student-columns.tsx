import {
  rowSelectionFeature,
  tableFeatures,
  type ColumnDef,
} from "@tanstack/react-table"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import { useState } from "react"
import { StudentAvatar } from "~/components/student-avatar"
import { DeleteStudentDialog } from "~/components/delete-student-dialog"
import { StudentFormDialog } from "~/components/student-form-dialog"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { formatClassroomName } from "~/lib/classroom-term"
import type { Classroom, Student } from "~/lib/schemas"

export type StudentSortKey = "name" | "student_id" | "classroom"
export type StudentSortDir = "asc" | "desc"

export const studentTableFeatures = tableFeatures({ rowSelectionFeature })

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

      <DeleteStudentDialog
        student={student}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
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
}): ColumnDef<typeof studentTableFeatures, Student>[] {
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
    },
    {
      id: "avatar",
      header: "",
      cell: ({ row }) => (
        <StudentAvatar student={row.original} className="size-8 rounded-full" />
      ),
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
          <Badge variant="secondary">{formatClassroomName(classroom)}</Badge>
        ) : (
          <Badge variant="outline">Unassigned</Badge>
        )
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => <ActionsCell student={row.original} />,
    },
  ]
}
