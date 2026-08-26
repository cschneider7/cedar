import {
  flexRender,
  useTable,
  type RowSelectionState,
} from "@tanstack/react-table"
import { LayoutGrid, List, Plus, Search, UsersIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useLocation, useNavigate, useNavigation } from "react-router"
import { DeleteConfirmDialog } from "~/components/delete-confirm-dialog"
import { RouteHydrateFallback } from "~/components/route-hydrate-fallback"
import { SearchInput } from "~/components/search-input"
import { StudentAvatar } from "~/components/student-avatar"
import { StudentFormDialog } from "~/components/student-form-dialog"
import { Alert, AlertDescription } from "~/components/ui/alert"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import {
  Item,
  ItemContent,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemTitle,
} from "~/components/ui/item"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "~/components/ui/pagination"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import { toast } from "~/components/ui/toast"
import { useDeleteResource } from "~/hooks/use-delete-resource"
import { useRootData } from "~/hooks/use-root-data"
import {
  useStudentViewMode,
  type StudentViewMode,
} from "~/hooks/use-student-view-mode"
import { getClassrooms, getStudentsPage } from "~/lib/api"
import { getAccessToken } from "~/lib/supabase/token"
import { formatClassroomName } from "~/lib/classroom-term"
import { getPageNumbers } from "~/lib/pagination"
import type { Classroom, Student } from "~/lib/schemas"
import { isAtStudentLimit } from "~/lib/student-limit"
import { cn } from "~/lib/utils"
import { parseViewModeCookie } from "~/lib/view-mode-cookie"
import type { Route } from "./+types/student-home"
import {
  getStudentColumns,
  studentTableFeatures,
  type StudentSortDir,
  type StudentSortKey,
} from "./student-columns"

export async function loader({ request, context }: Route.LoaderArgs) {
  const token = await getAccessToken(context)

  const url = new URL(request.url)
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1)
  const q = url.searchParams.get("q") ?? ""
  const viewParam = url.searchParams.get("view")
  const viewMode: StudentViewMode =
    viewParam === "list" || viewParam === "grid"
      ? viewParam
      : parseViewModeCookie(request.headers.get("Cookie"))
  const pageSize = viewMode === "list" ? 20 : 24
  const sortByParam = url.searchParams.get("sort_by")
  const sortBy: StudentSortKey =
    sortByParam === "student_id" || sortByParam === "classroom"
      ? sortByParam
      : "name"
  const sortDir: StudentSortDir =
    url.searchParams.get("sort_dir") === "desc" ? "desc" : "asc"

  const [studentsPage, classroomsResult] = await Promise.all([
    getStudentsPage(
      { page, pageSize, q: q || undefined, sortBy, sortDir },
      token
    ),
    getClassrooms(token).then(
      (classrooms) => ({ classrooms, failed: false }),
      () => ({ classrooms: [] as Classroom[], failed: true })
    ),
  ])
  return {
    studentsPage,
    page,
    q,
    viewMode,
    classrooms: classroomsResult.classrooms,
    classroomsError: classroomsResult.failed,
    sortBy,
    sortDir,
  }
}

export function HydrateFallback() {
  return <RouteHydrateFallback />
}

function ViewToggle({
  value,
  onChange,
}: {
  value: StudentViewMode
  onChange: (mode: StudentViewMode) => void
}) {
  return (
    <div className="flex items-center gap-1 rounded-md border p-1">
      <Button
        variant={value === "grid" ? "secondary" : "ghost"}
        size="icon-sm"
        aria-label="Grid view"
        aria-pressed={value === "grid"}
        onClick={() => onChange("grid")}
      >
        <LayoutGrid />
      </Button>
      <Button
        variant={value === "list" ? "secondary" : "ghost"}
        size="icon-sm"
        aria-label="List view"
        aria-pressed={value === "list"}
        onClick={() => onChange("list")}
      >
        <List />
      </Button>
    </div>
  )
}

function StudentCard({
  student,
  classroom,
}: {
  student: Student
  classroom?: Classroom
}) {
  return (
    <Item variant="outline" render={<Link to={`/students/${student.id}`} />}>
      <ItemHeader>
        <ItemMedia variant="image" className="aspect-square size-auto w-full">
          <StudentAvatar student={student} className="size-full text-4xl" />
        </ItemMedia>
      </ItemHeader>
      <ItemContent>
        <ItemTitle>{student.name}</ItemTitle>
      </ItemContent>
      <ItemFooter>
        {classroom ? (
          <Badge variant="secondary">{formatClassroomName(classroom)}</Badge>
        ) : (
          <Badge variant="outline">Unassigned</Badge>
        )}
      </ItemFooter>
    </Item>
  )
}

function EmptyNoStudents({ onAddStudent }: { onAddStudent: () => void }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <UsersIcon />
        </EmptyMedia>
        <EmptyTitle>No students yet</EmptyTitle>
        <EmptyDescription>
          Get started by adding your first student.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center gap-2">
        <Button onClick={onAddStudent}>Add Student</Button>
      </EmptyContent>
    </Empty>
  )
}

function EmptySearchNoResults({ onClear }: { onClear: () => void }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Search />
        </EmptyMedia>
        <EmptyTitle>No students found</EmptyTitle>
        <EmptyDescription>No students match your search.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="ghost" onClick={onClear}>
          Clear search
        </Button>
      </EmptyContent>
    </Empty>
  )
}

function PaginationControl({
  page,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
}: {
  page: number
  totalPages: number
  totalCount: number
  pageSize: number
  onPageChange: (page: number) => void
}) {
  const rangeStart = (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, totalCount)

  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <p className="text-sm text-muted-foreground">
        Showing {rangeStart}–{rangeEnd} of {totalCount} students
      </p>
      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                aria-disabled={page <= 1}
                className={page <= 1 ? "pointer-events-none opacity-50" : ""}
                onClick={(e) => {
                  e.preventDefault()
                  if (page > 1) onPageChange(page - 1)
                }}
              />
            </PaginationItem>
            {getPageNumbers(page, totalPages).map((p, i) =>
              p === "ellipsis" ? (
                <PaginationItem key={`ellipsis-${i}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={p}>
                  <PaginationLink
                    href="#"
                    isActive={p === page}
                    onClick={(e) => {
                      e.preventDefault()
                      onPageChange(p)
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
                aria-disabled={page >= totalPages}
                className={
                  page >= totalPages ? "pointer-events-none opacity-50" : ""
                }
                onClick={(e) => {
                  e.preventDefault()
                  if (page < totalPages) onPageChange(page + 1)
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  )
}

export default function Component({ loaderData }: Route.ComponentProps) {
  const {
    studentsPage,
    page,
    q,
    viewMode,
    classrooms,
    classroomsError,
    sortBy,
    sortDir,
  } = loaderData
  const navigate = useNavigate()
  const location = useLocation()
  const navigation = useNavigation()
  const rootData = useRootData()
  const studentCount = rootData.studentCount
  const studentLimit = rootData.studentLimit
  // Scoped to same-page param changes — cross-page navigation is already
  // covered by the global `NavLoadingIndicator`.
  const isLoading =
    navigation.state !== "idle" &&
    navigation.location?.pathname === location.pathname
  const [, setStoredViewMode] = useStudentViewMode()
  const [searchInput, setSearchInput] = useState(q)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const selectedCount = Object.keys(rowSelection).length
  const {
    isDeleting: isBulkDeleting,
    error: bulkDeleteError,
    submit: submitBulkDelete,
  } = useDeleteResource({
    successMessage: `${selectedCount} student${selectedCount === 1 ? "" : "s"} deleted`,
    onDeleted: () => {
      setBulkDeleteOpen(false)
      setRowSelection({})
    },
  })

  useEffect(() => {
    if (classroomsError) {
      toast.add({
        title: "Couldn't load classrooms — classroom badges may be missing.",
        type: "warning",
      })
    }
  }, [classroomsError])

  // Row selection is per-page state — clear it on any param change so it
  // doesn't silently refer to rows no longer on screen.
  useEffect(() => {
    setRowSelection({})
  }, [location.search])

  const classroomById = useMemo(
    () => new Map(classrooms.map((c) => [c.id, c])),
    [classrooms]
  )

  function updateParams(mutate: (p: URLSearchParams) => void, push = false) {
    const params = new URLSearchParams(location.search)
    mutate(params)
    navigate(`?${params.toString()}`, push ? undefined : { replace: true })
  }

  function handleViewModeChange(mode: StudentViewMode) {
    setStoredViewMode(mode)
    updateParams((p) => {
      p.set("view", mode)
      p.set("page", "1")
    }, true)
  }

  function handlePageChange(newPage: number) {
    updateParams((p) => p.set("page", String(newPage)), true)
  }

  function handleClearSearch() {
    setSearchInput("")
    updateParams((p) => {
      p.delete("q")
      p.set("page", "1")
    }, true)
  }

  function handleOpenCreate() {
    if (isAtStudentLimit(studentCount, studentLimit)) {
      toast.add({ title: "Student maximum reached", type: "error" })
      return
    }
    setCreateOpen(true)
  }

  const handleSortChange = useCallback(
    (key: StudentSortKey) => {
      const params = new URLSearchParams(location.search)
      if (sortBy === key) {
        params.set("sort_dir", sortDir === "asc" ? "desc" : "asc")
      } else {
        params.set("sort_by", key)
        params.set("sort_dir", "asc")
      }
      params.set("page", "1")
      navigate(`?${params.toString()}`)
    },
    [location.search, navigate, sortBy, sortDir]
  )

  function handleBulkDelete() {
    submitBulkDelete(JSON.stringify({ ids: Object.keys(rowSelection) }), {
      method: "post",
      action: "/students/bulk-delete",
      encType: "application/json",
    })
  }

  // Debounced search: keystrokes update the URL via replace so they don't
  // spam browser history; explicit page/view changes push instead.
  useEffect(() => {
    if (searchInput === q) return
    const timeout = setTimeout(() => {
      updateParams((p) => {
        if (searchInput) p.set("q", searchInput)
        else p.delete("q")
        p.set("page", "1")
      })
    }, 300)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  const columns = useMemo(
    () =>
      getStudentColumns({
        classroomById,
        sortBy,
        sortDir,
        onSortChange: handleSortChange,
      }),
    [classroomById, sortBy, sortDir, handleSortChange]
  )

  const table = useTable({
    data: studentsPage.students,
    columns,
    features: studentTableFeatures,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
    enableMultiRowSelection: true,
  })

  return (
    <div className="w-full">
      {studentCount !== null &&
        studentLimit !== null &&
        studentCount >= Math.ceil(studentLimit * 0.95) && (
          <Alert className="mb-4">
            <AlertDescription>
              You're approaching the maximum number of students - {studentCount}
              /{studentLimit}
            </AlertDescription>
          </Alert>
        )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search students..."
          aria-label="Search students"
        />
        <ViewToggle value={viewMode} onChange={handleViewModeChange} />
        <Button className="ml-auto" onClick={handleOpenCreate}>
          <Plus />
          <span>Add Student</span>
        </Button>
      </div>
      <StudentFormDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      {studentsPage.total_count === 0 && !q ? (
        <EmptyNoStudents onAddStudent={handleOpenCreate} />
      ) : studentsPage.total_count === 0 && q ? (
        <EmptySearchNoResults onClear={handleClearSearch} />
      ) : (
        <div className={isLoading ? "pointer-events-none opacity-50" : ""}>
          {viewMode === "grid" ? (
            <ItemGroup className="grid grid-cols-[repeat(auto-fill,160px)] gap-3">
              {studentsPage.students.map((student) => (
                <StudentCard
                  key={student.id}
                  student={student}
                  classroom={
                    student.classroom_id
                      ? classroomById.get(student.classroom_id)
                      : undefined
                  }
                />
              ))}
            </ItemGroup>
          ) : (
            <>
              {/* Fixed height + visibility (not conditional mount) so the
                  table below never shifts as the selection count changes. */}
              <div
                className={cn(
                  "mb-2 flex h-9 items-center justify-between rounded-md border bg-muted/50 px-3 py-2",
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
                  <DeleteConfirmDialog
                    trigger={
                      <Button variant="destructive" size="sm">
                        Delete
                      </Button>
                    }
                    open={bulkDeleteOpen}
                    onOpenChange={setBulkDeleteOpen}
                    title={`Delete ${selectedCount} student${selectedCount === 1 ? "" : "s"}?`}
                    description="This will permanently delete the selected students and cannot be undone. Are you sure you want to continue?"
                    isDeleting={isBulkDeleting}
                    error={bulkDeleteError}
                    onConfirm={handleBulkDelete}
                  />
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
                      tabIndex={0}
                      role="link"
                      aria-label={`View ${row.original.name}`}
                      className="cursor-pointer"
                      data-state={row.getIsSelected() ? "selected" : undefined}
                      onClick={() => navigate(`/students/${row.original.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          navigate(`/students/${row.original.id}`)
                        }
                      }}
                    >
                      {row.getAllCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          onClick={
                            cell.column.id === "select" ||
                            cell.column.id === "actions"
                              ? (e) => e.stopPropagation()
                              : undefined
                          }
                        >
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
            </>
          )}
        </div>
      )}

      {studentsPage.total_count > 0 && (
        <PaginationControl
          page={studentsPage.page}
          totalPages={studentsPage.total_pages}
          totalCount={studentsPage.total_count}
          pageSize={studentsPage.page_size}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  )
}
