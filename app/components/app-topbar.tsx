import { Plus, UserIcon } from "lucide-react"
import { Fragment, useState } from "react"
import { Link, useMatches, useRouteLoaderData, useSubmit } from "react-router"
import { ClassroomFormDialog } from "~/components/classroom-form-dialog"
import { StudentFormDialog } from "~/components/student-form-dialog"
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { Input } from "~/components/ui/input"
import { Separator } from "~/components/ui/separator"
import { SidebarTrigger } from "~/components/ui/sidebar"
import type { BreadcrumbHandle } from "~/lib/breadcrumb"
import type { loader as rootLoader } from "~/root"

function Breadcrumbs() {
  const matches = useMatches()
  const crumbs = matches
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

function AvatarMenu() {
  const submit = useSubmit()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="rounded-full">
            <Avatar>
              <AvatarFallback>
                <UserIcon className="size-4" />
              </AvatarFallback>
            </Avatar>
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled>Settings</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => submit(null, { method: "post", action: "/logout" })}
        >
          Log Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AuthControl() {
  const rootData = useRouteLoaderData<typeof rootLoader>("root")

  if (!rootData?.user) {
    return (
      <Button variant="default" render={<Link to="/login" />}>
        Sign in
      </Button>
    )
  }

  return <AvatarMenu />
}

export function AppTopbar() {
  return (
    <header className="sticky top-0 z-40 flex h-(--header-height) w-full shrink-0 items-center gap-2 border-b border-border bg-background px-4">
      <SidebarTrigger />
      <Link to="/" className="hidden items-center gap-2 font-medium md:flex">
        <span>Seating Chart</span>
      </Link>
      <Separator
        orientation="vertical"
        className="hidden sm:block data-vertical:h-4 data-vertical:self-auto"
      />
      <Breadcrumbs />
      <div className="ml-auto flex items-center gap-2">
        <Input placeholder="Search..." className="max-w-48 min-w-25" />
        <CreateDropdown />
        <AuthControl />
      </div>
    </header>
  )
}
