import { useMemo, useState } from "react"
import { Link, Outlet, useLocation, useRouteLoaderData } from "react-router"
import { PinToggleButton } from "~/components/pin-toggle-button"
import { Separator } from "~/components/ui/separator"
import { tabsListVariants } from "~/components/ui/tabs"
import { getPinnedClassrooms } from "~/lib/classroom-limit"
import {
  classroomTabFromPathname,
  type ClassroomTab,
} from "~/lib/classroom-tabs"
import { formatClassroomName, formatTerm } from "~/lib/classroom-term"
import {
  getClassroom,
  getClassroomSeatingChart,
  getSeparations,
  getStudents,
  toRouteError,
} from "~/lib/api"
import { tokenFromRequest } from "~/lib/auth"
import type { BreadcrumbHandle } from "~/lib/breadcrumb"
import { INITIAL_WEIGHT } from "~/lib/seating-chart-utils"
import type { loader as rootLoader } from "~/root"
import type { Route } from "./+types/classroom"

const TABS: { value: ClassroomTab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "roster", label: "Roster" },
  { value: "seating-chart", label: "Seating Chart" },
  { value: "cold-call", label: "Cold Call" },
]

// Mirrors ~/components/ui/tabs.tsx's TabsTrigger styling (including its
// data-active-driven active state) — duplicated rather than imported since
// this nav can't use the Tabs.Tab primitive itself (see comment below).
const TAB_TRIGGER_CLASSES =
  "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-2xl border border-transparent! px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring data-active:bg-background data-active:text-foreground dark:text-muted-foreground dark:hover:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground"

export const handle: BreadcrumbHandle = {
  breadcrumb: (data: Route.ComponentProps["loaderData"] | undefined) =>
    data ? formatClassroomName(data.classroom) : "",
  to: (data: Route.ComponentProps["loaderData"] | undefined) =>
    data ? `/classrooms/${data.classroom.id}` : "/classrooms",
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Classrooms" },
    { name: "description", content: "Seating chart app" },
  ]
}

export async function loader(args: Route.LoaderArgs) {
  const token = await tokenFromRequest(args)
  const { params } = args
  // Unlike other loaders here, failures are NOT degraded gracefully — a
  // seating chart can't render meaningfully with a partial roster/chart.
  try {
    const [classroom, seatingChart, allStudents, allSeparations] =
      await Promise.all([
        getClassroom(params.classroomId, token),
        getClassroomSeatingChart(params.classroomId, token),
        getStudents(token),
        getSeparations(token),
      ])
    const students = allStudents.filter((s) => s.classroom_id === classroom.id)
    const eligibleStudents = allStudents.filter(
      (s) => s.classroom_id !== classroom.id
    )
    const studentIds = new Set(students.map((s) => s.id))
    const separations = allSeparations.filter(
      (sep) =>
        studentIds.has(sep.student_id_a) && studentIds.has(sep.student_id_b)
    )
    return { classroom, students, eligibleStudents, seatingChart, separations }
  } catch (error) {
    toRouteError(error)
  }
}

export type ClassroomOutletContext = {
  coldCallWeights: Record<string, number>
  setColdCallWeights: (weights: Record<string, number>) => void
}

export default function Component({ loaderData }: Route.ComponentProps) {
  const { classroom, students } = loaderData
  const rootData = useRouteLoaderData<typeof rootLoader>("root")
  const pinnedCount = getPinnedClassrooms(rootData?.classrooms ?? []).length

  const location = useLocation()
  const activeTab = classroomTabFromPathname(location.pathname, classroom.id)

  // Lifted here (rather than living in the Cold Call tab itself) so these
  // ephemeral weights survive navigating away and back to that tab — this
  // layout route doesn't unmount across its children's navigations.
  const [coldCallWeights, setColdCallWeights] = useState<
    Record<string, number>
  >(() => Object.fromEntries(students.map((s) => [s.id, INITIAL_WEIGHT])))
  const outletContext = useMemo<ClassroomOutletContext>(
    () => ({ coldCallWeights, setColdCallWeights }),
    [coldCallWeights]
  )

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 className="font-heading text-lg">Period {classroom.period}</h2>
        <Separator
          orientation="vertical"
          className="hidden sm:block data-vertical:h-4 data-vertical:self-auto"
        />
        <h3 className="font-heading text-lg font-light">{classroom.subject}</h3>
        <Separator
          orientation="vertical"
          className="hidden sm:block data-vertical:h-4 data-vertical:self-auto"
        />
        <h3 className="font-heading text-lg font-light">
          {formatTerm(classroom.term_season, classroom.term_year)}
        </h3>
        <PinToggleButton classroom={classroom} pinnedCount={pinnedCount} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {/* Base UI's Tabs.Tab, composed with a Link `render` prop, loops
            infinitely (its active-tab bookkeeping re-triggers on every
            navigation) — so this is a plain nav instead of the primitive,
            since there's no TabsContent panel to justify it. */}
        <div className={tabsListVariants()}>
          {TABS.map((tab) => (
            <Link
              key={tab.value}
              to={`/classrooms/${classroom.id}${tab.value === "overview" ? "" : `/${tab.value}`}`}
              data-active={activeTab === tab.value || undefined}
              className={TAB_TRIGGER_CLASSES}
            >
              {tab.label}
            </Link>
          ))}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <Outlet context={outletContext} />
        </div>
      </div>
    </div>
  )
}
