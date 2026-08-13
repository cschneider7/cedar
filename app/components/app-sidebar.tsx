import {
  ClipboardList,
  Home,
  MoreHorizontal,
  Plus,
  UsersRound,
} from "lucide-react"
import { useState } from "react"
import {
  Link,
  NavLink,
  useLocation,
  useRevalidator,
  useRouteLoaderData,
} from "react-router"
import { ClassroomFormDialog } from "~/components/classroom-form-dialog"
import { DeleteClassroomDialog } from "~/components/delete-classroom-dialog"
import { Button } from "~/components/ui/button"
import { Wordmark } from "~/components/wordmark"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar"
import { toast } from "~/components/ui/toast"
import {
  MAX_CLASSROOMS_PER_USER,
  isAtClassroomLimit,
} from "~/lib/classroom-limit"
import type { Classroom } from "~/lib/schemas"
import type { loader as rootLoader } from "~/root"

/**
 * One classroom's row in the sidebar, with a view/edit/delete actions menu.
 */
function ClassroomRow({
  classroom,
  onRequestDelete,
}: {
  classroom: Classroom
  onRequestDelete: () => void
}) {
  const [editOpen, setEditOpen] = useState(false)
  const location = useLocation()

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={location.pathname === `/classrooms/${classroom.id}`}
        render={<NavLink to={`/classrooms/${classroom.id}`} />}
      >
        <span className="truncate">
          Period {classroom.period} — {classroom.subject}
        </span>
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuAction aria-label="Classroom actions" showOnHover>
              <MoreHorizontal />
            </SidebarMenuAction>
          }
        />
        <DropdownMenuContent side="right" align="start">
          <DropdownMenuItem
            render={<Link to={`/classrooms/${classroom.id}`} />}
          >
            View
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onRequestDelete}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ClassroomFormDialog
        mode="edit"
        classroom={classroom}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </SidebarMenuItem>
  )
}

/**
 * Primary nav sidebar: Home/Students/Classrooms links, the classroom list, and their create/edit/delete dialogs.
 */
export function AppSidebar() {
  const rootData = useRouteLoaderData<typeof rootLoader>("root")
  const classrooms = rootData?.classrooms ?? []
  const classroomsError = rootData?.classroomsError ?? false
  const [createOpen, setCreateOpen] = useState(false)
  const [deletingClassroom, setDeletingClassroom] = useState<Classroom | null>(
    null
  )
  const location = useLocation()
  const revalidator = useRevalidator()

  function handleNewClassroom() {
    if (isAtClassroomLimit(classrooms.length, MAX_CLASSROOMS_PER_USER)) {
      toast.add({
        title: `You've reached the ${MAX_CLASSROOMS_PER_USER} classroom limit.`,
        type: "error",
      })
      return
    }
    setCreateOpen(true)
  }

  return (
    <Sidebar className="top-(--header-height) h-[calc(100svh-var(--header-height))]!">
      <SidebarHeader>
        <Link to="/" className="px-3 pt-4 md:hidden">
          <Wordmark textClassName="text-lg font-medium" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Organization</SidebarGroupLabel>
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
          <SidebarGroupLabel>Seating Charts</SidebarGroupLabel>
          <SidebarGroupAction
            aria-label="New classroom"
            onClick={handleNewClassroom}
          >
            <Plus />
          </SidebarGroupAction>
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
            ) : (
              <SidebarMenu className="gap-1">
                {classrooms.map((classroom) => (
                  <ClassroomRow
                    key={classroom.id}
                    classroom={classroom}
                    onRequestDelete={() => setDeletingClassroom(classroom)}
                  />
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Tools (Coming Soon)</SidebarGroupLabel>
          <SidebarGroupContent></SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <ClassroomFormDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
      {deletingClassroom && (
        <DeleteClassroomDialog
          classroom={deletingClassroom}
          open={true}
          onOpenChange={(open) => {
            if (!open) setDeletingClassroom(null)
          }}
        />
      )}
    </Sidebar>
  )
}
