import { LogOut, Menu, Plus, Settings } from "lucide-react"
import { Fragment, useState } from "react"
import { Link, useMatches, useNavigate } from "react-router"
import { ClassroomFormDialog } from "~/components/classroom-form-dialog"
import { StudentFormDialog } from "~/components/student-form-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { NavLoadingIndicator } from "~/components/nav-loading-indicator"
import { Separator } from "~/components/ui/separator"
import { useSidebar } from "~/components/ui/sidebar"
import { useTheme } from "~/components/ui/theme-provider"
import { isTheme, themeIcons, ThemeToggle } from "~/components/ui/theme-toggle"
import { toast } from "~/components/ui/toast"
import { TopbarSearch } from "~/components/topbar-search"
import { Wordmark } from "~/components/wordmark"
import { useRootData } from "~/hooks/use-root-data"
import { authClient } from "~/lib/auth-client"
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
 * Signed-in account menu: profile, theme switcher, and sign out.
 */
function UserMenu() {
  const session = authClient.useSession()
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()

  const user = session.data?.user
  if (!user) return null

  const displayName = user.name || user.email || "Account"
  const email = user.email
  const initials =
    displayName
      .split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || displayName.slice(0, 2).toUpperCase()

  const avatarImageUrl = user.image ?? undefined

  const ThemeIcon = themeIcons[theme]

  async function handleSignOut() {
    await authClient.signOut()
    navigate("/")
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="Account menu"
            className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <Avatar>
              <AvatarImage src={avatarImageUrl} alt={displayName} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-max max-w-45">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {email && (
              <div className="truncate text-sm font-normal text-muted-foreground">
                {email}
              </div>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link to="/account" />}>
          <Settings />
          Account
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ThemeIcon />
            <span>Theme</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={theme}
              onValueChange={(value) => {
                if (isTheme(value)) setTheme(value)
              }}
            >
              <DropdownMenuRadioItem value="light" closeOnClick>
                Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark" closeOnClick>
                Dark
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system" closeOnClick>
                System
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Signed-out (theme toggle + sign in) or signed-in (account menu) controls.
 */
function AuthControl() {
  const session = authClient.useSession()

  if (session.isPending) return null

  if (!session.data) {
    return (
      <>
        <ThemeToggle />
        <Button
          variant="default"
          nativeButton={false}
          render={<Link to="/login" />}
        >
          Sign in
        </Button>
      </>
    )
  }

  return <UserMenu />
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
