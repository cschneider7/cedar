import { ChevronRight, ClipboardList, Home, UsersRound } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import {
  Link,
  NavLink,
  useLocation,
  useRevalidator,
  useRouteLoaderData,
} from "react-router"
import { Button } from "~/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "~/components/ui/sidebar"
import { Wordmark } from "~/components/wordmark"
import { getPinnedClassrooms } from "~/lib/classroom-limit"
import type { ClassroomTab } from "~/lib/classroom-tabs"
import { formatClassroomName } from "~/lib/classroom-term"
import type { Classroom } from "~/lib/schemas"
import type { loader as rootLoader } from "~/root"

const CLASSROOM_TABS: { value: ClassroomTab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "roster", label: "Roster" },
  { value: "seating-chart", label: "Seating Chart" },
  { value: "cold-call", label: "Cold Call" },
]

function classroomTabPath(classroomId: string, tab: ClassroomTab) {
  return tab === "overview"
    ? `/classrooms/${classroomId}`
    : `/classrooms/${classroomId}/${tab}`
}

/**
 * One pinned classroom's row in the sidebar: a collapsible submenu linking
 * to its four tabs.
 */
function ClassroomRow({ classroom }: { classroom: Classroom }) {
  const location = useLocation()
  const isCurrentClassroom = location.pathname.startsWith(
    `/classrooms/${classroom.id}`
  )
  const [open, setOpen] = useState(isCurrentClassroom)

  // Force-expand when navigation makes this the active classroom (e.g.
  // clicking into it from elsewhere) without fighting a manual collapse
  // afterwards — a plain `defaultOpen` would warn since this row stays
  // mounted (and thus already-initialized) across sidebar navigations.
  useEffect(() => {
    if (isCurrentClassroom) setOpen(true)
  }, [isCurrentClassroom])

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group/collapsible"
    >
      <SidebarMenuItem>
        <CollapsibleTrigger
          render={
            <SidebarMenuButton isActive={isCurrentClassroom}>
              <span className="truncate">{formatClassroomName(classroom)}</span>
              <ChevronRight className="ml-auto transition-transform group-data-open/collapsible:rotate-90" />
            </SidebarMenuButton>
          }
        />
        <CollapsibleContent>
          <SidebarMenuSub>
            {CLASSROOM_TABS.map((tab) => (
              <SidebarMenuSubItem key={tab.value}>
                <SidebarMenuSubButton
                  render={
                    <NavLink to={classroomTabPath(classroom.id, tab.value)} />
                  }
                >
                  {tab.label}
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

/**
 * Primary nav sidebar: Home/Students/Classrooms links and the pinned classroom list.
 */
export function AppSidebar() {
  const rootData = useRouteLoaderData<typeof rootLoader>("root")
  const classrooms = rootData?.classrooms ?? []
  const classroomsError = rootData?.classroomsError ?? false
  const location = useLocation()
  const revalidator = useRevalidator()

  const pinnedClassrooms = useMemo(
    () => getPinnedClassrooms(classrooms),
    [classrooms]
  )

  return (
    <Sidebar className="top-(--header-height) h-[calc(100svh-var(--header-height))]!">
      <SidebarHeader>
        <Link to="/" className="px-3 pt-4 md:hidden">
          <Wordmark textClassName="text-lg font-medium" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Home"
                  isActive={location.pathname === "/"}
                  render={<NavLink to="/" />}
                >
                  <Home />
                  <span>Home</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Students"
                  isActive={location.pathname.startsWith("/students")}
                  render={<NavLink to="/students" />}
                >
                  <UsersRound />
                  <span>Students</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Classrooms"
                  isActive={location.pathname === "/classrooms"}
                  render={<NavLink to="/classrooms" />}
                >
                  <ClipboardList />
                  <span>Classrooms</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Classrooms</SidebarGroupLabel>
          <SidebarGroupContent>
            {classroomsError ? (
              <div className="flex flex-col gap-1 px-2 py-1 text-sm text-muted-foreground">
                <span>Couldn&apos;t load classrooms.</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto w-fit px-1 py-0.5"
                  disabled={revalidator.state !== "idle"}
                  onClick={() => revalidator.revalidate()}
                >
                  Retry
                </Button>
              </div>
            ) : pinnedClassrooms.length === 0 ? (
              <div className="px-4 py-1 text-sm text-muted-foreground italic">
                Empty
              </div>
            ) : (
              <SidebarMenu className="gap-1">
                {pinnedClassrooms.map((classroom) => (
                  <ClassroomRow key={classroom.id} classroom={classroom} />
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
