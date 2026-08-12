import { Show, useClerk, useUser } from "@clerk/react-router"
import { LogOut, Menu, Plus, Settings } from "lucide-react"
import { Fragment, useState } from "react"
import { Link, useMatches } from "react-router"
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
import { TopbarSearch } from "~/components/topbar-search"
import { Wordmark } from "~/components/wordmark"
import type { BreadcrumbHandle } from "~/lib/breadcrumb"

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
          <DropdownMenuItem onClick={() => setStudentOpen(true)}>
            New student
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setClassroomOpen(true)}>
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
  const { user } = useUser()
  const { signOut, openUserProfile } = useClerk()
  const { theme, setTheme } = useTheme()

  if (!user) return null

  const displayName =
    user.fullName || user.primaryEmailAddress?.emailAddress || "Account"
  const email = user.primaryEmailAddress?.emailAddress
  const initials =
    `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() ||
    displayName.slice(0, 2).toUpperCase()

  // Avatar renders at size-8 (32px) — request a 2x-retina-sized crop
  // instead of Clerk's full-size default image.
  let avatarImageUrl: string | undefined
  if (user.imageUrl) {
    const url = new URL(user.imageUrl)
    url.searchParams.set("width", "64")
    url.searchParams.set("height", "64")
    url.searchParams.set("fit", "crop")
    avatarImageUrl = url.toString()
  }

  const ThemeIcon = themeIcons[theme]

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
        <DropdownMenuItem onClick={() => openUserProfile()}>
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
        <DropdownMenuItem
          variant="destructive"
          onClick={() => signOut({ redirectUrl: "/" })}
        >
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
  return (
    <>
      <Show when="signed-out">
        <ThemeToggle />
        <Button
          variant="default"
          nativeButton={false}
          render={<Link to="/login" />}
        >
          Sign in
        </Button>
      </Show>
      <Show when="signed-in">
        <UserMenu />
      </Show>
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
