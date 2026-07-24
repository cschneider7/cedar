import { Plus, Search, UsersIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { NavLink } from "react-router"
import { StudentFormDialog } from "~/components/student-form-dialog"
import { Button } from "~/components/ui/button"
import {
  Empty,
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
import { Item, ItemGroup } from "~/components/ui/item"
import { ScrollArea } from "~/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import type { Student } from "~/lib/schemas"

function SearchForm({
  query,
  onQueryChange,
}: {
  query: string
  onQueryChange: (value: string) => void
}) {
  return (
    <InputGroup>
      <InputGroupInput
        aria-label="Search students"
        placeholder="Search..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
    </InputGroup>
  )
}

function RosterList({
  students,
  query,
  onQueryChange,
}: {
  students: Student[]
  query: string
  onQueryChange: (value: string) => void
}) {
  const filteredStudents = useMemo(
    () =>
      students.filter((student) =>
        student.name.toLowerCase().includes(query.toLowerCase())
      ),
    [students, query]
  )

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <SearchForm query={query} onQueryChange={onQueryChange} />
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-medium text-muted-foreground">
          Students
        </span>
        <Tooltip>
          <StudentFormDialog
            mode="create"
            trigger={
              <TooltipTrigger
                render={
                  <Button variant="ghost" size="icon-sm">
                    <Plus /> <span className="sr-only">Create new student</span>
                  </Button>
                }
              />
            }
          />
          <TooltipContent>Create new student</TooltipContent>
        </Tooltip>
      </div>
      {filteredStudents.length > 0 ? (
        <ScrollArea className="min-h-0 flex-1">
          <ItemGroup className="gap-1 pr-3">
            {filteredStudents.map((student) => (
              <Item
                key={student.id}
                size="xs"
                render={<NavLink to={`/students/${student.id}`} />}
              >
                <span className="truncate">{student.name}</span>
              </Item>
            ))}
          </ItemGroup>
        </ScrollArea>
      ) : students.length === 0 ? (
        <Empty className="justify-start gap-2 rounded-none border-none p-4">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon />
            </EmptyMedia>
            <EmptyTitle>No Students</EmptyTitle>
            <EmptyDescription>
              Click on + to create your first student.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Empty className="justify-start gap-2 rounded-none border-none p-4">
          <EmptyDescription>No students found</EmptyDescription>
        </Empty>
      )}
    </div>
  )
}

export function StudentSidebar({ students }: { students: Student[] }) {
  const [query, setQuery] = useState("")

  return (
    <div className="hidden h-full w-56 shrink-0 flex-col border-r border-border md:flex">
      <div className="min-h-0 flex-1 p-3">
        <RosterList
          students={students}
          query={query}
          onQueryChange={setQuery}
        />
      </div>
    </div>
  )
}

export function MobileStudentDrawer({ students }: { students: Student[] }) {
  const [query, setQuery] = useState("")

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant="outline" className="mb-2 md:hidden">
            <UsersIcon />
            <span>Students</span>
          </Button>
        }
      />
      <SheetContent side="left" className="flex w-full max-w-xs flex-col p-0">
        <SheetHeader>
          <SheetTitle>Students</SheetTitle>
          <SheetDescription className="sr-only">
            Browse and search students
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 px-4 pb-4">
          <RosterList
            students={students}
            query={query}
            onQueryChange={setQuery}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
