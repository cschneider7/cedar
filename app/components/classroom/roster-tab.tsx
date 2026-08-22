import {
  flexRender,
  tableFeatures,
  useTable,
  type ColumnDef,
} from "@tanstack/react-table"
import {
  ArmchairIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  UserXIcon,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useFetcher } from "react-router"
import { StudentAvatar } from "~/components/student-avatar"
import { StudentFormDialog } from "~/components/student-form-dialog"
import { AvatarGroup, AvatarGroupCount } from "~/components/ui/avatar"
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import type { MutationResult } from "~/lib/action-results"
import type { Separation, Student } from "~/lib/schemas"
import { AddStudentsDialog } from "./add-students-dialog"
import { SeatingPreferencesDialog } from "./seating-preferences-dialog"

const rosterTableFeatures = tableFeatures({})

// Beyond this many avoided students, the rest are collapsed into a "+N" count.
const MAX_AVOID_AVATARS = 5

function SeparationAvoidBadge({
  avoidedStudents,
}: {
  avoidedStudents: Student[]
}) {
  const visibleStudents = avoidedStudents.slice(0, MAX_AVOID_AVATARS)
  const overflowCount = avoidedStudents.length - visibleStudents.length

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            variant="secondary"
            className="h-7 gap-1.5 overflow-visible rounded-full py-1 select-none"
          >
            Avoid
            <AvatarGroup>
              {visibleStudents.map((student) => (
                <StudentAvatar
                  key={student.id}
                  student={student}
                  className="size-5 rounded-full text-[7px]"
                />
              ))}
              {overflowCount > 0 && (
                <AvatarGroupCount className="size-5 text-[7px] ring-0">
                  +{overflowCount}
                </AvatarGroupCount>
              )}
            </AvatarGroup>
          </Badge>
        }
      />
      <TooltipContent>Avoid Seating Next To</TooltipContent>
    </Tooltip>
  )
}

function RosterActionsCell({
  student,
  onOpenSeatingPreferences,
}: {
  student: Student
  onOpenSeatingPreferences: (student: Student) => void
}) {
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
        <DropdownMenuContent align="end" className="w-50">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <PencilIcon />
            Edit Info
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onOpenSeatingPreferences(student)}>
            <ArmchairIcon />
            Seating Preferences
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
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

function getRosterColumns(
  avoidedByStudentId: Map<string, Student[]>,
  onOpenSeatingPreferences: (student: Student) => void
): ColumnDef<typeof rosterTableFeatures, Student>[] {
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
      id: "seating_preferences",
      header: "Seating Preferences",
      cell: ({ row }) => {
        const student = row.original
        const avoidedStudents = avoidedByStudentId.get(student.id)
        const hasSeparations = !!avoidedStudents && avoidedStudents.length > 0

        if (!student.seating_preference && !hasSeparations) {
          return <span className="text-sm text-muted-foreground">—</span>
        }

        return (
          <div className="flex flex-wrap items-center gap-1.5">
            {student.seating_preference && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Badge variant="secondary" className="h-7 select-none">
                      {student.seating_preference === "front"
                        ? "Front"
                        : "Back"}
                    </Badge>
                  }
                />
                <TooltipContent>
                  {student.seating_preference === "front"
                    ? "Front of Classroom"
                    : "Back of Classroom"}
                </TooltipContent>
              </Tooltip>
            )}
            {hasSeparations && (
              <SeparationAvoidBadge avoidedStudents={avoidedStudents} />
            )}
          </div>
        )
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <RosterActionsCell
          student={row.original}
          onOpenSeatingPreferences={onOpenSeatingPreferences}
        />
      ),
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
  const [seatingPreferencesOpen, setSeatingPreferencesOpen] = useState(false)
  const [seatingPreferencesSearch, setSeatingPreferencesSearch] = useState("")

  function openSeatingPreferences(student?: Student) {
    setSeatingPreferencesSearch(student?.name ?? "")
    setSeatingPreferencesOpen(true)
  }

  const avoidedByStudentId = useMemo(() => {
    const studentsById = new Map(students.map((s) => [s.id, s]))
    const map = new Map<string, Student[]>()
    for (const separation of separations) {
      const a = studentsById.get(separation.student_id_a)
      const b = studentsById.get(separation.student_id_b)
      if (!a || !b) {
        continue
      }
      map.set(a.id, [...(map.get(a.id) ?? []), b])
      map.set(b.id, [...(map.get(b.id) ?? []), a])
    }
    return map
  }, [students, separations])

  const columns = useMemo(
    () => getRosterColumns(avoidedByStudentId, openSeatingPreferences),
    [avoidedByStudentId]
  )

  const table = useTable({
    data: students,
    columns,
    features: rosterTableFeatures,
    getRowId: (row) => row.id,
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="secondary" onClick={() => openSeatingPreferences()}>
          <ArmchairIcon />
          <span>Seating Preferences</span>
        </Button>
        <Button onClick={() => setAddStudentsOpen(true)}>
          <PlusIcon />
          <span>Add Students</span>
        </Button>
      </div>

      <AddStudentsDialog
        open={addStudentsOpen}
        onOpenChange={setAddStudentsOpen}
        classroomId={classroomId}
        eligibleStudents={eligibleStudents}
      />
      <SeatingPreferencesDialog
        open={seatingPreferencesOpen}
        onOpenChange={setSeatingPreferencesOpen}
        students={students}
        separations={separations}
        initialSearch={seatingPreferencesSearch}
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
