import { SignedIn, SignedOut, UserButton } from "@neondatabase/auth-ui"
import { Menu, Plus, Settings } from "lucide-react"
import { Fragment, useState } from "react"
import { Link, useMatches } from "react-router"
import { ClassroomFormDialog } from "~/components/classroom-form-dialog"
import { StudentFormDialog } from "~/components/student-form-dialog"
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
import { NavLoadingIndicator } from "~/components/nav-loading-indicator"
import { Separator } from "~/components/ui/separator"
import { useSidebar } from "~/components/ui/sidebar"
import { ThemeToggle } from "~/components/theme-toggle"
import { toast } from "~/components/ui/toast"
import { TopbarSearch } from "~/components/topbar-search"
import { Wordmark } from "~/components/wordmark"
import { useRootData } from "~/hooks/use-root-data"
import type { BreadcrumbHandle } from "~/lib/breadcrumb"
import {
  MAX_CLASSROOMS_PER_USER,
  isAtClassroomLimit,
} from "~/lib/classroom-limit"
import { isAtStudentLimit } from "~/lib/student-limit"

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
 * Signed-out (sign in button) or signed-in (account menu) controls, plus an
 * always-visible theme toggle. The account menu is auth-ui's own
 * `UserButton` rather than a hand-rolled dropdown — `disableDefaultLinks`
 * turns off its built-in "Settings" link (which targets
 * `accountViewPaths.SETTINGS`, i.e. `/settings`, not this app's actual
 * `/account` page) in favor of an explicit `additionalLinks` entry. Its
 * built-in "Sign out" link is not similarly overridable (see
 * `routes/auth/sign-out.tsx`), and isn't gated by `disableDefaultLinks`.
 */
function AuthControl() {
  return (
    <>
      <ThemeToggle />
      <SignedOut>
        <Button
          variant="default"
          nativeButton={false}
          render={<Link to="/auth/sign-in" />}
        >
          Sign in
        </Button>
      </SignedOut>
      <SignedIn>
        <UserButton
          size="icon"
          disableDefaultLinks
          additionalLinks={[
            { href: "/account", icon: <Settings />, label: "Account" },
          ]}
        />
      </SignedIn>
    </>
  )
}

/**
 * App-wide top bar: sidebar toggle, breadcrumbs, search, create menu, and auth controls.
 */
export function AppTopbar() {
  const { toggleSidebar } = useSidebar()
  const crumbs = useBreadcrumbs()

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
        <TopbarSearch />
        <CreateDropdown />
        <AuthControl />
      </div>
    </header>
  )
}
