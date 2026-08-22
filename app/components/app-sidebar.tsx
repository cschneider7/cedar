import { ClipboardList, Home, MoreHorizontal, UsersRound } from "lucide-react"
import { useMemo, useState } from "react"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar"
import { Wordmark } from "~/components/wordmark"
import { useClassroomPatch } from "~/hooks/use-classroom-patch"
import { usePinClassroom } from "~/hooks/use-pin-classroom"
import { getPinnedClassrooms } from "~/lib/classroom-limit"
import { formatClassroomName } from "~/lib/classroom-term"
import type { Classroom } from "~/lib/schemas"
import type { loader as rootLoader } from "~/root"

/**
 * Swaps `pinned_at` between two pinned classrooms via two independent
 * `useClassroomPatch` fetchers — there's no dedicated reorder endpoint.
 * React Router's automatic post-action revalidation refreshes the sidebar
 * once both writes land, so no manual revalidate is needed here. If the
 * second write fails after the first succeeds, the pinned order can end up
 * slightly wrong — not worth transactional reorder machinery for a 10-item
 * cosmetic ordering.
 */
function useReorderPinnedClassrooms() {
  const a = useClassroomPatch()
  const b = useClassroomPatch()
  const isSwapping = a.fetcher.state !== "idle" || b.fetcher.state !== "idle"

  function swap(
    x: { id: string; pinned_at: string },
    y: { id: string; pinned_at: string }
  ) {
    a.submit(x.id, { pinned_at: y.pinned_at })
    b.submit(y.id, { pinned_at: x.pinned_at })
  }

  return { swap, isSwapping }
}

/**
 * One pinned classroom's row in the sidebar, with a
 * view/edit/pin/reorder/delete actions menu.
 */
function ClassroomRow({
  classroom,
  pinnedCount,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onRequestDelete,
}: {
  classroom: Classroom
  pinnedCount: number
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onRequestDelete: () => void
}) {
  const [editOpen, setEditOpen] = useState(false)
  const location = useLocation()
  const { setPinned, isPending: isPinPending } = usePinClassroom()
  const isPinned = classroom.pinned_at != null

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={location.pathname === `/classrooms/${classroom.id}`}
        render={<NavLink to={`/classrooms/${classroom.id}`} />}
      >
        <span className="truncate">{formatClassroomName(classroom)}</span>
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
          <DropdownMenuGroup>
            <DropdownMenuItem
              render={<Link to={`/classrooms/${classroom.id}`} />}
            >
              View
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              Edit
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              disabled={isPinPending}
              onClick={() => setPinned(classroom.id, !isPinned, pinnedCount)}
            >
              {isPinned ? "Unpin" : "Pin"}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canMoveUp} onClick={onMoveUp}>
              Move Up
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canMoveDown} onClick={onMoveDown}>
              Move Down
            </DropdownMenuItem>
          </DropdownMenuGroup>
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
  const [deletingClassroom, setDeletingClassroom] = useState<Classroom | null>(
    null
  )
  const location = useLocation()
  const revalidator = useRevalidator()
  const { swap, isSwapping } = useReorderPinnedClassrooms()

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
                {pinnedClassrooms.map((classroom, index) => (
                  <ClassroomRow
                    key={classroom.id}
                    classroom={classroom}
                    pinnedCount={pinnedClassrooms.length}
                    canMoveUp={index > 0 && !isSwapping}
                    canMoveDown={
                      index < pinnedClassrooms.length - 1 && !isSwapping
                    }
                    onMoveUp={() =>
                      swap(classroom, pinnedClassrooms[index - 1])
                    }
                    onMoveDown={() =>
                      swap(classroom, pinnedClassrooms[index + 1])
                    }
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
