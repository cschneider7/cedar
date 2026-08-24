import { ArrowUpRightIcon, ClipboardList, UsersRound } from "lucide-react"
import { useEffect } from "react"
import { Link } from "react-router"
import { RouteHydrateFallback } from "~/components/route-hydrate-fallback"
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
import { authClient, getBearerToken } from "~/lib/auth-client"
import { getClassrooms, getStudents } from "~/lib/api"
import type { Route } from "./+types/home"

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Cedar" },
    {
      name: "description",
      content: "Cedar — organize classrooms and seating charts.",
    },
  ]
}

export async function clientLoader() {
  const { data: session } = await authClient.getSession()
  // `/` is a public route (unlike students/classrooms, it has no auth gate)
  // — an anonymous visitor has no session to scope data to, and the backend
  // 401s without one, so skip the calls entirely rather than surfacing that
  // 401 as an error toast.
  if (!session) {
    return {
      isAuthenticated: false as const,
      classroomsError: false,
      studentsError: false,
    }
  }
  const token = await getBearerToken()
  // Classrooms/students are only fetched to detect a reachability failure
  // for the toasts below — the dashboard doesn't display their data itself.
  const [classroomsFailed, studentsFailed] = await Promise.all([
    getClassrooms(token).then(
      () => false,
      () => true
    ),
    getStudents(token).then(
      () => false,
      () => true
    ),
  ])
  return {
    isAuthenticated: true as const,
    classroomsError: classroomsFailed,
    studentsError: studentsFailed,
  }
}

export function HydrateFallback() {
  return <RouteHydrateFallback />
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
  const { isAuthenticated, classroomsError, studentsError } = loaderData

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
        <h1 className="font-heading text-2xl font-medium">Cedar</h1>
        <p className="text-muted-foreground">
          Manage your students, classrooms, and seating charts.
        </p>
      </div>
      {!isAuthenticated ? (
        <SignedOutHome />
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
