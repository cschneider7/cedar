import { flexRender, useTable } from "@tanstack/react-table"
import { ClipboardList, Plus, Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router"
import { ClassroomFormDialog } from "~/components/classroom-form-dialog"
import { RouteHydrateFallback } from "~/components/route-hydrate-fallback"
import { Alert, AlertDescription } from "~/components/ui/alert"
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
import { getClassrooms, getStudents } from "~/lib/api"
import { getAccessToken } from "~/lib/supabase/token"
import {
  MAX_CLASSROOMS_PER_USER,
  getPinnedClassrooms,
  isAtClassroomLimit,
} from "~/lib/classroom-limit"
import { formatTerm } from "~/lib/classroom-term"
import type { Student } from "~/lib/schemas"
import type { Route } from "./+types/classroom-home"
import {
  classroomTableFeatures,
  getClassroomColumns,
} from "./classroom-columns"

const CLASSROOMS_PAGE_SIZE = 10

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Classrooms" },
    {
      name: "description",
      content: "Cedar — organize classrooms and seating charts.",
    },
  ]
}

export async function loader({ context }: Route.LoaderArgs) {
  const token = await getAccessToken(context)

  const [classrooms, studentsResult] = await Promise.all([
    getClassrooms(token),
    getStudents(token).then(
      (students) => ({ students, failed: false }),
      () => ({ students: [] as Student[], failed: true })
    ),
  ])
  const studentCounts = new Map<string, number>()
  for (const student of studentsResult.students) {
    if (!student.classroom_id) continue
    studentCounts.set(
      student.classroom_id,
      (studentCounts.get(student.classroom_id) ?? 0) + 1
    )
  }
  return {
    classrooms,
    studentCounts: Object.fromEntries(studentCounts),
    studentsError: studentsResult.failed,
  }
}

export function HydrateFallback() {
  return <RouteHydrateFallback />
}

function EmptyClassrooms() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ClipboardList />
        </EmptyMedia>
        <EmptyTitle>No Classrooms Yet</EmptyTitle>
        <EmptyDescription>
          You haven&apos;t created any classrooms yet. Get started by creating
          your first classroom.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center gap-2">
        <ClassroomFormDialog
          mode="create"
          trigger={<Button>Create classroom</Button>}
        />
      </EmptyContent>
    </Empty>
  )
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
        aria-label="Search classrooms"
        placeholder="Search classrooms..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
    </InputGroup>
  )
}

function EmptySearchNoResults({ onClear }: { onClear: () => void }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Search />
        </EmptyMedia>
        <EmptyTitle>No classrooms found</EmptyTitle>
        <EmptyDescription>No classrooms match your search.</EmptyDescription>
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

function ClassroomPaginationControl({
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
        Showing {rangeStart}–{rangeEnd} of {totalCount} classrooms
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
  const { classrooms, studentCounts, studentsError } = loaderData
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState("")
  const [createOpen, setCreateOpen] = useState(false)

  function handleOpenCreate() {
    if (isAtClassroomLimit(classrooms.length, MAX_CLASSROOMS_PER_USER)) {
      toast.add({
        title: `You've reached the ${MAX_CLASSROOMS_PER_USER} classroom limit.`,
        type: "error",
      })
      return
    }
    setCreateOpen(true)
  }

  useEffect(() => {
    if (studentsError) {
      toast.add({ title: "Couldn't load student counts.", type: "warning" })
    }
  }, [studentsError])

  const filteredClassrooms = useMemo(() => {
    const q = searchInput.trim().toLowerCase()
    if (!q) return classrooms
    return classrooms.filter(
      (classroom) =>
        classroom.subject.toLowerCase().includes(q) ||
        formatTerm(classroom.term_season, classroom.term_year)
          .toLowerCase()
          .includes(q)
    )
  }, [classrooms, searchInput])

  const pinnedCount = useMemo(
    () => getPinnedClassrooms(classrooms).length,
    [classrooms]
  )

  const columns = useMemo(
    () => getClassroomColumns({ studentCounts, studentsError, pinnedCount }),
    [studentCounts, studentsError, pinnedCount]
  )

  const table = useTable({
    data: filteredClassrooms,
    columns,
    features: classroomTableFeatures,
    getRowId: (row) => row.id,
    initialState: {
      pagination: { pageIndex: 0, pageSize: CLASSROOMS_PAGE_SIZE },
    },
  })

  const { pageIndex, pageSize } = table.state.pagination

  return (
    <>
      {classrooms.length === 0 ? (
        <EmptyClassrooms />
      ) : (
        <div>
          {classrooms.length >= Math.ceil(MAX_CLASSROOMS_PER_USER * 0.95) && (
            <Alert className="mb-4">
              <AlertDescription>
                You&apos;re approaching the maximum number of classrooms -{" "}
                {classrooms.length}/{MAX_CLASSROOMS_PER_USER}
              </AlertDescription>
            </Alert>
          )}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <SearchInput value={searchInput} onChange={setSearchInput} />
            <Button className="ml-auto" onClick={handleOpenCreate}>
              <Plus />
              <span>Create classroom</span>
            </Button>
            <ClassroomFormDialog
              mode="create"
              open={createOpen}
              onOpenChange={setCreateOpen}
            />
          </div>

          {filteredClassrooms.length === 0 ? (
            <EmptySearchNoResults onClear={() => setSearchInput("")} />
          ) : (
            <>
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
                      aria-label={`View ${row.original.subject}`}
                      className="cursor-pointer"
                      onClick={() => navigate(`/classrooms/${row.original.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          navigate(`/classrooms/${row.original.id}`)
                        }
                      }}
                    >
                      {row.getAllCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          onClick={
                            cell.column.id === "actions" ||
                            cell.column.id === "pin"
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
              <ClassroomPaginationControl
                page={pageIndex + 1}
                totalPages={table.getPageCount()}
                totalCount={filteredClassrooms.length}
                pageSize={pageSize}
                onPageChange={(p) => table.setPageIndex(p - 1)}
              />
            </>
          )}
        </div>
      )}
    </>
  )
}
