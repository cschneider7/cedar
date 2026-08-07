import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type RowSelectionState,
} from "@tanstack/react-table"
import {
  LayoutGrid,
  List,
  Plus,
  Search,
  Trash2Icon,
  UsersIcon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Link,
  useFetcher,
  useLocation,
  useNavigate,
  useNavigation,
} from "react-router"
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
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog"
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "~/components/ui/input-group"
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
import { Spinner } from "~/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import {
  useStudentViewMode,
  type StudentViewMode,
} from "~/hooks/use-student-view-mode"
import { getClassrooms, getStudentsPage } from "~/lib/api"
import { tokenFromRequest } from "~/lib/auth"
import type { Classroom, Student } from "~/lib/schemas"
import {
  getStudentColumns,
  type StudentSortDir,
  type StudentSortKey,
} from "./student-columns"
import type { Route } from "./+types/student-home"

export async function loader(args: Route.LoaderArgs) {
  const token = await tokenFromRequest(args)
  const { request } = args
  const url = new URL(request.url)
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1)
  const q = url.searchParams.get("q") ?? ""
  const viewMode: StudentViewMode =
    url.searchParams.get("view") === "list" ? "list" : "grid"
  const pageSize = viewMode === "list" ? 20 : 24
  const sortByParam = url.searchParams.get("sort_by")
  const sortBy: StudentSortKey =
    sortByParam === "student_id" || sortByParam === "classroom"
      ? sortByParam
      : "name"
  const sortDir: StudentSortDir =
    url.searchParams.get("sort_dir") === "desc" ? "desc" : "asc"

  const [studentsPage, classrooms] = await Promise.all([
    getStudentsPage(
      { page, pageSize, q: q || undefined, sortBy, sortDir },
      token
    ),
    getClassrooms(token),
  ])
  return { studentsPage, page, q, viewMode, classrooms, sortBy, sortDir }
}

function SearchInput({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <InputGroup className="max-w-xs">
      <InputGroupInput
        aria-label="Search students"
        placeholder="Search students..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
    </InputGroup>
  )
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
          <Badge variant="secondary">Period {classroom.period}</Badge>
        ) : (
          <Badge variant="outline">Unassigned</Badge>
        )}
      </ItemFooter>
    </Item>
  )
}

function EmptyNoStudents() {
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
        <StudentFormDialog
          mode="create"
          trigger={<Button>Add Student</Button>}
        />
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

function getPageNumbers(
  current: number,
  total: number
): (number | "ellipsis")[] {
  if (total <= 1) return [1]
  const delta = 1
  const range: number[] = []
  for (
    let i = Math.max(2, current - delta);
    i <= Math.min(total - 1, current + delta);
    i++
  ) {
    range.push(i)
  }

  const pages: (number | "ellipsis")[] = [1]
  if (range[0] > 2) pages.push("ellipsis")
  pages.push(...range)
  if (range.length > 0 && range[range.length - 1] < total - 1) {
    pages.push("ellipsis")
  } else if (range.length === 0 && total > 2) {
    pages.push("ellipsis")
  }
  pages.push(total)
  return pages
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
  const { studentsPage, page, q, viewMode, classrooms, sortBy, sortDir } =
    loaderData
  const navigate = useNavigate()
  const location = useLocation()
  const navigation = useNavigation()
  const isLoading = navigation.state !== "idle"
  const [storedViewMode, setStoredViewMode] = useStudentViewMode()
  const [searchInput, setSearchInput] = useState(q)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const bulkDeleteFetcher = useFetcher<{ ok: boolean; error?: string }>()
  const isBulkDeleting = bulkDeleteFetcher.state !== "idle"
  const bulkDeleteError =
    bulkDeleteFetcher.data && !bulkDeleteFetcher.data.ok
      ? bulkDeleteFetcher.data.error
      : null

  // A returning user's stored view-mode preference isn't visible to the SSR
  // loader (no localStorage on the server), so sync it into the URL once on
  // mount if the URL doesn't already specify a view.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (!params.has("view") && storedViewMode === "list") {
      params.set("view", "list")
      navigate(`?${params.toString()}`, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Row selection is per-page state; a page/sort/search/view change loads a
  // different set of students, so stale selections are cleared rather than
  // silently referring to rows no longer on screen.
  useEffect(() => {
    setRowSelection({})
  }, [location.search])

  useEffect(() => {
    if (bulkDeleteFetcher.state === "idle" && bulkDeleteFetcher.data?.ok) {
      const count = Object.keys(rowSelection).length
      setBulkDeleteOpen(false)
      setRowSelection({})
      toast.success(`${count} student${count === 1 ? "" : "s"} deleted`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkDeleteFetcher.state, bulkDeleteFetcher.data])

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
    bulkDeleteFetcher.submit(
      JSON.stringify({ ids: Object.keys(rowSelection) }),
      {
        method: "post",
        action: "/students/bulk-delete",
        encType: "application/json",
      }
    )
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

  const table = useReactTable({
    data: studentsPage.students,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    pageCount: studentsPage.total_pages,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
    enableMultiRowSelection: true,
  })

  const selectedCount = Object.keys(rowSelection).length

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={searchInput} onChange={setSearchInput} />
        <ViewToggle value={viewMode} onChange={handleViewModeChange} />
        <StudentFormDialog
          mode="create"
          trigger={
            <Button className="ml-auto">
              <Plus />
              <span>Add Student</span>
            </Button>
          }
        />
      </div>

      {studentsPage.total_count === 0 && !q ? (
        <EmptyNoStudents />
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
              {selectedCount > 0 && (
                <div className="mb-2 flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2">
                  <span className="text-sm">{selectedCount} selected</span>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRowSelection({})}
                    >
                      Clear
                    </Button>
                    <AlertDialog
                      open={bulkDeleteOpen}
                      onOpenChange={setBulkDeleteOpen}
                    >
                      <AlertDialogTrigger
                        render={
                          <Button variant="destructive" size="sm">
                            Delete
                          </Button>
                        }
                      />
                      <AlertDialogContent size="sm">
                        <AlertDialogHeader>
                          <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
                            <Trash2Icon />
                          </AlertDialogMedia>
                          <AlertDialogTitle>
                            Delete {selectedCount} student
                            {selectedCount === 1 ? "" : "s"}?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete the selected students
                            and cannot be undone. Are you sure you want to
                            continue?
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        {bulkDeleteError && (
                          <Alert variant="destructive">
                            <AlertDescription>
                              {bulkDeleteError}
                            </AlertDescription>
                          </Alert>
                        )}
                        <AlertDialogFooter>
                          <AlertDialogCancel variant="outline">
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            disabled={isBulkDeleting}
                            onClick={handleBulkDelete}
                          >
                            {isBulkDeleting && <Spinner />}
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              )}
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
                      className="cursor-pointer"
                      data-state={row.getIsSelected() ? "selected" : undefined}
                      onClick={() => navigate(`/students/${row.original.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          navigate(`/students/${row.original.id}`)
                        }
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
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
