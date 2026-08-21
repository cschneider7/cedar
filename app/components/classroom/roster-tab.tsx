import {
  flexRender,
  tableFeatures,
  useTable,
  type ColumnDef,
} from "@tanstack/react-table"
import {
  MoreHorizontalIcon,
  PencilIcon,
  SplitIcon,
  UserXIcon,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useFetcher } from "react-router"
import { StudentAvatar } from "~/components/student-avatar"
import { StudentFormDialog } from "~/components/student-form-dialog"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyTitle } from "~/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import { toast } from "~/components/ui/toast"
import { KeepApartDialog } from "~/components/seating-chart/seating-chart-dialogs"
import type { MutationResult } from "~/lib/action-results"
import type { Separation, Student } from "~/lib/schemas"
import { AddStudentsDialog } from "./add-students-dialog"

const rosterTableFeatures = tableFeatures({})

function RosterActionsCell({ student }: { student: Student }) {
  const [editOpen, setEditOpen] = useState(false)
  const fetcher = useFetcher<MutationResult>()

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      toast.add({ title: "Student unassigned", type: "success" })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data])

  function handleUnassign() {
    fetcher.submit(
      { classroom_id: null },
      {
        method: "post",
        action: `/students/${student.id}/edit`,
        encType: "application/json",
      }
    )
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
            disabled={fetcher.state !== "idle"}
            onClick={handleUnassign}
          >
            <UserXIcon />
            Unassign
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <StudentFormDialog
        mode="edit"
        student={student}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </>
  )
}

function getRosterColumns(): ColumnDef<typeof rosterTableFeatures, Student>[] {
  return [
    {
      id: "avatar",
      header: "",
      cell: ({ row }) => (
        <StudentAvatar student={row.original} className="size-8 rounded-full" />
      ),
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => row.original.name,
    },
    {
      accessorKey: "student_id",
      header: "Student ID",
      cell: ({ row }) => row.original.student_id,
    },
    {
      id: "seating_preference",
      header: "Seating Preference",
      cell: ({ row }) =>
        row.original.seating_preference ? (
          <Badge variant="secondary">
            {row.original.seating_preference === "front" ? "Front" : "Back"}
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => <RosterActionsCell student={row.original} />,
    },
  ]
}

/**
 * Roster management surface: list/edit/unassign students on this classroom,
 * plus the Add Students picker (which also covers creating a new student)
 * and the Seating Preferences (keep-apart pairs) dialog.
 */
export function RosterTab({
  classroomId,
  students,
  eligibleStudents,
  separations,
}: {
  classroomId: string
  students: Student[]
  eligibleStudents: Student[]
  separations: Separation[]
}) {
  const [addStudentsOpen, setAddStudentsOpen] = useState(false)
  const [keepApartOpen, setKeepApartOpen] = useState(false)

  const columns = useMemo(() => getRosterColumns(), [])

  const table = useTable({
    data: students,
    columns,
    features: rosterTableFeatures,
    getRowId: (row) => row.id,
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="secondary" onClick={() => setKeepApartOpen(true)}>
          <SplitIcon /> Seating Preferences
        </Button>
        <Button onClick={() => setAddStudentsOpen(true)}>Add Students</Button>
      </div>

      <AddStudentsDialog
        open={addStudentsOpen}
        onOpenChange={setAddStudentsOpen}
        classroomId={classroomId}
        eligibleStudents={eligibleStudents}
      />
      <KeepApartDialog
        open={keepApartOpen}
        onOpenChange={setKeepApartOpen}
        students={students}
        separations={separations}
      />

      {students.length === 0 ? (
        <Empty>
          <EmptyTitle>No students yet</EmptyTitle>
          <EmptyDescription>
            Add students to this classroom's roster to get started.
          </EmptyDescription>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
