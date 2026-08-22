import {
  createPaginatedRowModel,
  createSortedRowModel,
  flexRender,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
  useTable,
  type ColumnDef,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table"
import {
  ArmchairIcon,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  UserXIcon,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useFetcher } from "react-router"
import { SearchInput } from "~/components/search-input"
import { StudentAvatar } from "~/components/student-avatar"
import { StudentFormDialog } from "~/components/student-form-dialog"
import { AvatarGroup, AvatarGroupCount } from "~/components/ui/avatar"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from "~/components/ui/empty"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "~/components/ui/pagination"
import { Spinner } from "~/components/ui/spinner"
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
import { useDeleteResource } from "~/hooks/use-delete-resource"
import { getPageNumbers } from "~/lib/pagination"
import type { Separation, Student } from "~/lib/schemas"
import { cn } from "~/lib/utils"
import { AddStudentsDialog } from "./add-students-dialog"
import { SeatingPreferencesDialog } from "./seating-preferences-dialog"

const ROSTER_PAGE_SIZE = 10

const rosterTableFeatures = tableFeatures({
  rowSelectionFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
})

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
            variant="destructive"
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
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(checked) => row.toggleSelected(checked)}
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
      enableSorting: true,
      sortFn: "alphanumeric",
      header: ({ column }) => {
        const sorted = column.getIsSorted()
        const Icon =
          sorted === "asc"
            ? ArrowUp
            : sorted === "desc"
              ? ArrowDown
              : ArrowUpDown
        return (
          <button
            type="button"
            className="flex items-center gap-1 font-medium"
            onClick={column.getToggleSortingHandler()}
          >
            Name
            <Icon
              className={sorted ? "size-3.5" : "size-3.5 text-muted-foreground"}
            />
          </button>
        )
      },
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
  const [search, setSearch] = useState("")
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: ROSTER_PAGE_SIZE,
  })

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

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) {
      return students
    }
    return students.filter((s) => s.name.toLowerCase().includes(query))
  }, [students, search])

  // Selection/paging are scoped to what's currently visible — reset both
  // whenever the search narrows or widens the row set.
  useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }))
    setRowSelection({})
  }, [search])

  const columns = useMemo(
    () => getRosterColumns(avoidedByStudentId, openSeatingPreferences),
    [avoidedByStudentId]
  )

  const table = useTable({
    data: filteredStudents,
    columns,
    features: rosterTableFeatures,
    state: { sorting, rowSelection, pagination },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    getRowId: (row) => row.id,
    enableMultiRowSelection: true,
  })

  const selectedCount = Object.keys(rowSelection).length
  const {
    isDeleting: isUnassigning,
    error: unassignError,
    submit: submitBulkUnassign,
  } = useDeleteResource({
    successMessage: `${selectedCount} student${selectedCount === 1 ? "" : "s"} unassigned`,
    onDeleted: () => setRowSelection({}),
  })

  useEffect(() => {
    if (unassignError) {
      toast.add({ title: unassignError, type: "error" })
    }
  }, [unassignError])

  function handleBulkUnassign() {
    submitBulkUnassign(JSON.stringify({ ids: Object.keys(rowSelection) }), {
      method: "post",
      action: "/students/bulk-unassign",
      encType: "application/json",
    })
  }

  const pageCount = table.getPageCount()

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search roster..."
          aria-label="Search roster"
        />
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => openSeatingPreferences()}>
            <ArmchairIcon />
            <span>Seating Preferences</span>
          </Button>
          <Button onClick={() => setAddStudentsOpen(true)}>
            <PlusIcon />
            <span>Add Students</span>
          </Button>
        </div>
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
      ) : filteredStudents.length === 0 ? (
        <Empty>
          <EmptyTitle>No students found</EmptyTitle>
          <EmptyDescription>No students match your search.</EmptyDescription>
          <EmptyContent>
            <Button variant="ghost" onClick={() => setSearch("")}>
              Clear search
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          {/* Fixed height + visibility (not conditional mount) so the table
              below never shifts as the selection count changes. */}
          <div
            className={cn(
              "flex h-9 items-center justify-between rounded-md border bg-muted/50 px-3 py-2",
              selectedCount > 0 ? "visible" : "invisible"
            )}
          >
            <span className="text-sm">{selectedCount} selected</span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRowSelection({})}
              >
                Clear
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={isUnassigning}
                onClick={handleBulkUnassign}
              >
                {isUnassigning && <Spinner />}
                Unassign
              </Button>
            </div>
          </div>

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
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                >
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Showing {pagination.pageIndex * pagination.pageSize + 1}–
                {Math.min(
                  (pagination.pageIndex + 1) * pagination.pageSize,
                  filteredStudents.length
                )}{" "}
                of {filteredStudents.length} students
              </p>
              <Pagination className="mx-0 w-fit">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      aria-disabled={!table.getCanPreviousPage()}
                      className={
                        !table.getCanPreviousPage()
                          ? "pointer-events-none opacity-50"
                          : ""
                      }
                      onClick={(e) => {
                        e.preventDefault()
                        table.previousPage()
                      }}
                    />
                  </PaginationItem>
                  {getPageNumbers(pagination.pageIndex + 1, pageCount).map(
                    (p, i) =>
                      p === "ellipsis" ? (
                        <PaginationItem key={`ellipsis-${i}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={p}>
                          <PaginationLink
                            href="#"
                            isActive={p === pagination.pageIndex + 1}
                            onClick={(e) => {
                              e.preventDefault()
                              table.setPageIndex(p - 1)
                            }}
                          >
                            {p}
                          </PaginationLink>
                        </PaginationItem>
                      )
                  )}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      aria-disabled={!table.getCanNextPage()}
                      className={
                        !table.getCanNextPage()
                          ? "pointer-events-none opacity-50"
                          : ""
                      }
                      onClick={(e) => {
                        e.preventDefault()
                        table.nextPage()
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </>
      )}
    </div>
  )
}
