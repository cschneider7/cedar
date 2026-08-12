import {
  createPaginatedRowModel,
  rowPaginationFeature,
  tableFeatures,
  type ColumnDef,
} from "@tanstack/react-table"
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { ClassroomFormDialog } from "~/components/classroom-form-dialog"
import { DeleteClassroomDialog } from "~/components/delete-classroom-dialog"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import type { Classroom } from "~/lib/schemas"

export const classroomTableFeatures = tableFeatures({
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
})

function ActionsCell({ classroom }: { classroom: Classroom }) {
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
              aria-label={`Actions for ${classroom.subject}`}
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

      <ClassroomFormDialog
        mode="edit"
        classroom={classroom}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <DeleteClassroomDialog
        classroom={classroom}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  )
}

export function getClassroomColumns({
  studentCounts,
  studentsError,
}: {
  studentCounts: Record<string, number>
  studentsError: boolean
}): ColumnDef<typeof classroomTableFeatures, Classroom>[] {
  return [
    {
      accessorKey: "subject",
      header: "Subject",
      cell: ({ row }) => row.original.subject,
    },
    {
      id: "period",
      header: "Period",
      cell: ({ row }) => (
        <Badge variant="secondary">Period {row.original.period}</Badge>
      ),
    },
    {
      id: "students",
      header: "Students",
      cell: ({ row }) => {
        if (studentsError) return "—"
        const count = studentCounts[row.original.id] ?? 0
        return `${count} ${count === 1 ? "student" : "students"}`
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => <ActionsCell classroom={row.original} />,
    },
  ]
}
