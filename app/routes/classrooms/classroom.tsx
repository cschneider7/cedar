import { useRef, useState } from "react"
import { useLocation, useNavigate, useRouteLoaderData } from "react-router"
import { OverviewTab } from "~/components/classroom/overview-tab"
import { RosterTab } from "~/components/classroom/roster-tab"
import { ColdCallTab } from "~/components/classroom/cold-call-tab"
import { UnsavedChartChangesDialog } from "~/components/classroom/unsaved-chart-changes-dialog"
import { PinToggleButton } from "~/components/pin-toggle-button"
import {
  SeatingChartCanvas,
  type SeatingChartCanvasHandle,
} from "~/components/seating-chart/seating-chart-canvas"
import { Separator } from "~/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { getPinnedClassrooms } from "~/lib/classroom-limit"
import { isClassroomTab, type ClassroomTab } from "~/lib/classroom-tabs"
import { formatClassroomName, formatTerm } from "~/lib/classroom-term"
import {
  getClassroom,
  getClassroomSeatingChart,
  getSeparations,
  getStudents,
  toRouteError,
  updateClassroomSeatingChart,
} from "~/lib/api"
import { tokenFromRequest } from "~/lib/auth"
import type { BreadcrumbHandle } from "~/lib/breadcrumb"
import { SeatingChartSchema } from "~/lib/schemas"
import { INITIAL_WEIGHT } from "~/lib/seating-chart-utils"
import type { loader as rootLoader } from "~/root"
import type { Route } from "./+types/classroom"

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

export async function action(args: Route.ActionArgs) {
  const rawData = await args.request.json()
  const result = SeatingChartSchema.safeParse(rawData)

  if (!result.success) {
    return { ok: false, error: "Please check the seating chart and try again." }
  }

  try {
    await updateClassroomSeatingChart(
      args.params.classroomId,
      result.data,
      await tokenFromRequest(args)
    )
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }

  return { ok: true }
}

export default function Component({ loaderData }: Route.ComponentProps) {
  const { classroom, students, eligibleStudents, seatingChart, separations } =
    loaderData
  const rootData = useRouteLoaderData<typeof rootLoader>("root")
  const pinnedCount = getPinnedClassrooms(rootData?.classrooms ?? []).length

  const location = useLocation()
  const navigate = useNavigate()
  const tabParam = new URLSearchParams(location.search).get("tab")
  const tab: ClassroomTab = isClassroomTab(tabParam) ? tabParam : "overview"

  const [chartLocked, setChartLocked] = useState(true)
  const [pendingTab, setPendingTab] = useState<ClassroomTab | null>(null)
  const chartRef = useRef<SeatingChartCanvasHandle>(null)
  const [coldCallWeights, setColdCallWeights] = useState<
    Record<string, number>
  >(() => Object.fromEntries(students.map((s) => [s.id, INITIAL_WEIGHT])))

  function updateParams(mutate: (p: URLSearchParams) => void) {
    const params = new URLSearchParams(location.search)
    mutate(params)
    navigate(`?${params.toString()}`)
  }

  function handleTabChange(next: string) {
    if (!isClassroomTab(next)) {
      return
    }
    if (!chartLocked && next !== "seating-chart") {
      setPendingTab(next)
      return
    }
    updateParams((p) => p.set("tab", next))
  }

  function handleConfirmLeaveChart() {
    chartRef.current?.discardChanges()
    if (pendingTab) {
      updateParams((p) => p.set("tab", pendingTab))
    }
    setPendingTab(null)
  }

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
      <Tabs
        value={tab}
        onValueChange={handleTabChange}
        className="flex min-h-0 flex-1 flex-col gap-4"
      >
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="seating-chart">Seating Chart</TabsTrigger>
          <TabsTrigger value="cold-call">Cold Call</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" keepMounted>
          <OverviewTab
            students={students}
            seatingChart={seatingChart}
            onNavigateTab={handleTabChange}
          />
        </TabsContent>
        <TabsContent
          value="roster"
          keepMounted
          className="flex min-h-0 flex-1 flex-col"
        >
          <RosterTab
            classroomId={classroom.id}
            students={students}
            eligibleStudents={eligibleStudents}
            separations={separations}
          />
        </TabsContent>
        <TabsContent
          value="seating-chart"
          keepMounted
          className="flex min-h-0 flex-1 flex-col"
        >
          <SeatingChartCanvas
            ref={chartRef}
            classroomId={classroom.id}
            seatingChart={seatingChart}
            students={students}
            onLockedChange={setChartLocked}
          />
        </TabsContent>
        <TabsContent value="cold-call" keepMounted>
          <ColdCallTab
            classroomId={classroom.id}
            students={students}
            weights={coldCallWeights}
            onWeightsChange={setColdCallWeights}
            onNavigateTab={handleTabChange}
          />
        </TabsContent>
      </Tabs>
      <UnsavedChartChangesDialog
        open={pendingTab !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingTab(null)
          }
        }}
        onConfirmLeave={handleConfirmLeaveChart}
      />
    </div>
  )
}
