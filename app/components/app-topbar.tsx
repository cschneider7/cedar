import { LogOut, Menu, Plus, Settings } from "lucide-react"
import { Fragment, useState } from "react"
import { Link, useMatches, useNavigate, useRouteLoaderData } from "react-router"
import { ClassroomFormDialog } from "~/components/classroom-form-dialog"
import { NavLoadingIndicator } from "~/components/nav-loading-indicator"
import { StudentFormDialog } from "~/components/student-form-dialog"
import { ThemeToggle } from "~/components/theme-toggle"
import { TopbarSearch } from "~/components/topbar-search"
import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~/components/ui/breadcrumb"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { Separator } from "~/components/ui/separator"
import { useSidebar } from "~/components/ui/sidebar"
import { toast } from "~/components/ui/toast"
import { Wordmark } from "~/components/wordmark"
import { useRootData } from "~/hooks/use-root-data"
import type { BreadcrumbHandle } from "~/lib/breadcrumb"
import {
  MAX_CLASSROOMS_PER_USER,
  isAtClassroomLimit,
} from "~/lib/classroom-limit"
import { isAtStudentLimit } from "~/lib/student-limit"
import { createSupabaseBrowserClient } from "~/lib/supabase/client"
import type { loader as rootLoader } from "~/root"

/**
 * Breadcrumb trail entries built from matched routes' `handle.breadcrumb`.
 * @returns The current route's breadcrumb entries, empty if none apply.
 */
function useBreadcrumbs() {
  const matches = useMatches()
  return matches
    .map((match) => {
      const handle = match.handle as BreadcrumbHandle | undefined
      if (typeof handle?.breadcrumb !== "function") return null
      const label = handle.breadcrumb(match.loaderData)
      if (!label) return null
      const to =
        typeof handle.to === "function"
          ? handle.to(match.loaderData)
          : handle.to
      return { id: match.id, to, label }
    })
    .filter((crumb) => crumb !== null)
}

/**
 * Breadcrumb trail built from matched routes' `handle.breadcrumb`.
 * @param crumbs - The breadcrumb entries to render, from `useBreadcrumbs`.
 */
function Breadcrumbs({
  crumbs,
}: {
  crumbs: ReturnType<typeof useBreadcrumbs>
}) {
  if (crumbs.length === 0) return null

  return (
    <Breadcrumb className="hidden md:block">
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((crumb, index) => (
          <Fragment key={crumb.id}>
            <BreadcrumbItem>
              {index === crumbs.length - 1 ? (
                <BreadcrumbPage className="truncate">
                  {crumb.label}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbLink
                  className="truncate"
                  render={<Link to={crumb.to} />}
                >
                  {crumb.label}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {index < crumbs.length - 1 && <BreadcrumbSeparator />}
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

/**
 * Topbar "Create" dropdown, opening the new-student/new-classroom dialogs.
 */
function CreateDropdown() {
  const [studentOpen, setStudentOpen] = useState(false)
  const [classroomOpen, setClassroomOpen] = useState(false)
  const rootData = useRootData()

  function handleNewStudent() {
    if (
      isAtStudentLimit(
        rootData?.studentCount ?? null,
        rootData?.studentLimit ?? null
      )
    ) {
      toast.add({ title: "Student maximum reached", type: "error" })
      return
    }
    setStudentOpen(true)
  }

  function handleNewClassroom() {
    if (
      isAtClassroomLimit(
        rootData?.classrooms?.length ?? null,
        MAX_CLASSROOMS_PER_USER
      )
    ) {
      toast.add({
        title: `You've reached the ${MAX_CLASSROOMS_PER_USER} classroom limit.`,
        type: "error",
      })
      return
    }
    setClassroomOpen(true)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline">
              <Plus />
              Create
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleNewStudent}>
            New student
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleNewClassroom}>
            New classroom
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <StudentFormDialog
        mode="create"
        open={studentOpen}
        onOpenChange={setStudentOpen}
      />
      <ClassroomFormDialog
        mode="create"
        open={classroomOpen}
        onOpenChange={setClassroomOpen}
      />
    </>
  )
}

/**
 * Avatar/email dropdown with an Account link and sign-out action.
 */
function AccountMenu({ userEmail }: { userEmail: string }) {
  const navigate = useNavigate()

  async function handleSignOut() {
    await createSupabaseBrowserClient().auth.signOut()
    navigate("/")
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Account">
            <Avatar>
              <AvatarFallback>{userEmail[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem render={<Link to="/account" />}>
          <Settings />
          Account
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * App-wide top bar: sidebar toggle, breadcrumbs, search, create menu, and auth controls.
 */
export function AppTopbar() {
  const { toggleSidebar } = useSidebar()
  const crumbs = useBreadcrumbs()
  const rootData = useRouteLoaderData<typeof rootLoader>("root")
  const isSignedIn = rootData?.isSignedIn ?? false

  return (
    <header className="sticky top-0 z-40 flex h-(--header-height) w-full shrink-0 items-center gap-2 border-b border-border bg-background px-4">
      <Button
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
        onClick={toggleSidebar}
        aria-label="Toggle Sidebar"
      >
        <Menu />
      </Button>
      <Link to="/" className="hidden md:flex">
        <Wordmark textClassName="font-medium" />
      </Link>
      {crumbs.length > 0 && (
        <Separator
          orientation="vertical"
          className="hidden md:block data-vertical:h-4 data-vertical:self-auto"
        />
      )}
      <Breadcrumbs crumbs={crumbs} />
      <div className="ml-auto flex items-center gap-2">
        <NavLoadingIndicator />
        {isSignedIn && (
          <>
            <TopbarSearch />
            <CreateDropdown />
          </>
        )}
        <ThemeToggle />
        {isSignedIn ? (
          <AccountMenu userEmail={rootData?.userEmail ?? ""} />
        ) : (
          <Button
            variant="default"
            nativeButton={false}
            render={<Link to="/login" />}
          >
            Sign in
          </Button>
        )}
      </div>
    </header>
  )
}
