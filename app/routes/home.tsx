import { getAuth } from "@clerk/react-router/server"
import { ArrowUpRightIcon, ClipboardList, UsersRound } from "lucide-react"
import { useEffect } from "react"
import { Link } from "react-router"
import { ClassroomFormDialog } from "~/components/classroom-form-dialog"
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
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "~/components/ui/item"
import { toast } from "~/components/ui/toast"
import { getClassrooms, getStudents } from "~/lib/api"
import type { Classroom } from "~/lib/schemas"
import type { Route } from "./+types/home"

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Seating Chart" },
    { name: "description", content: "Seating chart app" },
  ]
}

export async function loader(args: Route.LoaderArgs) {
  const { isAuthenticated, getToken } = await getAuth(args)
  // `/` is a public route (unlike students/classrooms, it has no `requireAuth`
  // middleware) — an anonymous visitor has no session to scope data to, and
  // the backend 401s without one, so skip the calls entirely rather than
  // surfacing that 401 as an error toast.
  if (!isAuthenticated) {
    return {
      isAuthenticated: false as const,
      classrooms: [],
      classroomsError: false,
      studentsError: false,
    }
  }
  const token = await getToken()
  const [classroomsResult, studentsFailed] = await Promise.all([
    getClassrooms(token).then(
      (classrooms) => ({ classrooms, failed: false }),
      () => ({ classrooms: [] as Classroom[], failed: true })
    ),
    // Students are only fetched to detect a reachability failure for the
    // toast below — the dashboard doesn't display student data itself.
    getStudents(token).then(
      () => false,
      () => true
    ),
  ])
  return {
    isAuthenticated: true as const,
    classrooms: classroomsResult.classrooms,
    classroomsError: classroomsResult.failed,
    studentsError: studentsFailed,
  }
}

/**
 * Static nav cards shown to a signed-out visitor, who has no classroom or
 * student data to show yet.
 */
function SignedOutHome() {
  return (
    <ItemGroup className="w-full max-w-md">
      <Item variant="outline" render={<Link to="/students" />}>
        <ItemMedia variant="image">
          <UsersRound className="size-7" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Students</ItemTitle>
          <ItemDescription>
            View, add, and edit the student roster.
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <ArrowUpRightIcon className="size-4 text-muted-foreground" />
        </ItemActions>
      </Item>
      <Item variant="outline" render={<Link to="/classrooms" />}>
        <ItemMedia variant="image">
          <ClipboardList className="size-7" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Classrooms</ItemTitle>
          <ItemDescription>
            Manage classrooms and their seating charts.
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <ArrowUpRightIcon className="size-4 text-muted-foreground" />
        </ItemActions>
      </Item>
    </ItemGroup>
  )
}

function EmptyDashboard() {
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

function StatTile({
  icon,
  label,
  to,
}: {
  icon: React.ReactNode
  label: string
  to: string
}) {
  return (
    <Item variant="outline" render={<Link to={to} />}>
      <ItemMedia variant="image">{icon}</ItemMedia>
      <ItemContent>
        <ItemTitle>Manage {label}</ItemTitle>
      </ItemContent>
      <ItemActions>
        <ArrowUpRightIcon className="size-4 text-muted-foreground" />
      </ItemActions>
    </Item>
  )
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { isAuthenticated, classrooms, classroomsError, studentsError } =
    loaderData

  useEffect(() => {
    if (classroomsError)
      toast.add({ title: "Couldn't load classrooms.", type: "warning" })
  }, [classroomsError])
  useEffect(() => {
    if (studentsError)
      toast.add({ title: "Couldn't load students.", type: "warning" })
  }, [studentsError])

  return (
    <div className="flex h-full min-h-0 flex-col items-center gap-8 overflow-y-auto p-6">
      <div className="text-center">
        <h1 className="font-heading text-2xl font-medium">Seating Chart</h1>
        <p className="text-muted-foreground">
          Manage your students, classrooms, and seating charts.
        </p>
      </div>
      {!isAuthenticated ? (
        <SignedOutHome />
      ) : classrooms.length === 0 && !classroomsError ? (
        <EmptyDashboard />
      ) : (
        <ItemGroup className="w-full max-w-md">
          <StatTile
            icon={<ClipboardList className="size-7" />}
            label="Classrooms"
            to="/classrooms"
          />
          <StatTile
            icon={<UsersRound className="size-7" />}
            label="Students"
            to="/students"
          />
        </ItemGroup>
      )}
    </div>
  )
}
