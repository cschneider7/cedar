import { useNodesState } from "@xyflow/react"
import {
  ArrowLeftIcon,
  Edit2Icon,
  Maximize2Icon,
  MoreHorizontalIcon,
  ShuffleIcon,
  TableIcon,
  Trash2Icon,
  UsersIcon,
  UsersRoundIcon,
  UserXIcon,
} from "lucide-react"
import React, { useEffect, useMemo, useRef, useState } from "react"
import { Link, useFetcher } from "react-router"
import { toast } from "sonner"
import {
  RosterPanel,
  SeatingChartCanvas,
  type SeatingChartCanvasHandle,
} from "~/components/seating-chart-canvas"
import { Alert, AlertDescription } from "~/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { Button } from "~/components/ui/button"
import { ButtonGroup } from "~/components/ui/button-group"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group"
import { Spinner } from "~/components/ui/spinner"
import { Switch } from "~/components/ui/switch"
import {
  getClassroom,
  getClassroomSeatingChart,
  getStudents,
  updateClassroomSeatingChart,
} from "~/lib/api"
import type { RandomizeSeatingChartOptions, SeatingChart } from "~/lib/schemas"
import {
  buildInitialNodes,
  buildSeatingChartPayload,
  computeRandomizeTableCount,
  createCanvasTable,
  DEFAULT_TABLE_COLS,
  DEFAULT_TABLE_ROWS,
  findNewTablePosition,
  getBoundaryMinSize,
  getSeatId,
  getSeatPosition,
  getTableGeometry,
  getUnassignedStudents,
  GRID_STEP,
  MAX_TABLE_DIMENSION,
  RANDOMIZE_TABLE_COUNT_WARNING_THRESHOLD,
  reorderNodes,
  type SeatingChartSeatNode,
  type SeatingChartTableNode,
  type TableGeometry,
} from "~/lib/seating-chart-utils"
import type { Route } from "./+types/classroom"
import type { action as editClassroomAction } from "./edit-classroom"
import type { action as randomizeSeatingChartAction } from "./randomize-seating-chart"

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Classrooms" },
    { name: "description", content: "Seating chart app" },
  ]
}

export async function loader({ params }: Route.ClientLoaderArgs) {
  const [classroom, seatingChart, allStudents] = await Promise.all([
    getClassroom(params.classroomId),
    getClassroomSeatingChart(params.classroomId),
    getStudents(),
  ])
  const students = allStudents.filter((s) => s.classroom_id === classroom.id)
  return { classroom, students, seatingChart }
}

export async function action({ params, request }: Route.ActionArgs) {
  const chart: SeatingChart = await request.json()

  try {
    await updateClassroomSeatingChart(params.classroomId, chart)
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }

  return { ok: true }
}

function RandomSeatingChartDialog({
  classroomId,
  studentCount,
  keptTables,
  boundary,
  onGenerate,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  classroomId: string
  studentCount: number
  keptTables: TableGeometry[]
  boundary: { width: number; height: number }
  onGenerate: (chart: SeatingChart) => void
}) {
  const [keepExisting, setKeepExisting] = useState(keptTables.length > 0)
  const [sizeMode, setSizeMode] = useState<"default" | "custom">("default")
  const [customRows, setCustomRows] = useState(DEFAULT_TABLE_ROWS)
  const [customCols, setCustomCols] = useState(DEFAULT_TABLE_COLS)

  const fetcher = useFetcher<typeof randomizeSeatingChartAction>()
  const isSubmitting = fetcher.state !== "idle"

  useEffect(() => {
    if (!props.open) {
      return
    }
    setKeepExisting(keptTables.length > 0)
    setSizeMode("default")
    setCustomRows(DEFAULT_TABLE_ROWS)
    setCustomCols(DEFAULT_TABLE_COLS)
  }, [props.open])

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      onGenerate(fetcher.data.seatingChart)
    }
  }, [fetcher.state, fetcher.data])

  const rows = sizeMode === "default" ? DEFAULT_TABLE_ROWS : customRows
  const cols = sizeMode === "default" ? DEFAULT_TABLE_COLS : customCols

  const keptCapacity = keepExisting
    ? keptTables.reduce((sum, t) => sum + t.rows * t.cols, 0)
    : 0
  const { neededNewTables, totalTables } = computeRandomizeTableCount(
    studentCount,
    keepExisting ? keptTables.length : 0,
    keptCapacity,
    rows,
    cols
  )

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const payload: RandomizeSeatingChartOptions = {
      keep_existing_tables: keepExisting,
      new_table_rows: rows,
      new_table_cols: cols,
      existing_tables: keepExisting ? keptTables : [],
      boundary_width: boundary.width,
      boundary_height: boundary.height,
    }
    fetcher.submit(payload, {
      method: "post",
      action: `/classrooms/${classroomId}/randomize-seating-chart`,
      encType: "application/json",
    })
  }

  return (
    <Dialog {...props}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Randomize Seating Chart</DialogTitle>
            <DialogDescription>
              Nothing is saved until you click Save.
            </DialogDescription>
          </DialogHeader>
          {fetcher.data && !fetcher.data.ok && (
            <Alert variant="destructive">
              <AlertDescription>{fetcher.data.error}</AlertDescription>
            </Alert>
          )}
          <FieldGroup>
            <Field orientation="horizontal">
              <Switch
                id="table-retain"
                checked={keepExisting}
                onCheckedChange={setKeepExisting}
                disabled={keptTables.length === 0}
              />
              <FieldContent>
                <FieldLabel className="font-normal">
                  Keep Existing Tables
                </FieldLabel>
                <FieldDescription>
                  Adds tables automatically if needed.
                </FieldDescription>
              </FieldContent>
            </Field>
            <FieldSet className="w-full max-w-xs">
              <FieldLegend variant="label">New Table Size</FieldLegend>
              <RadioGroup
                value={sizeMode}
                onValueChange={(value) =>
                  setSizeMode(value as "default" | "custom")
                }
              >
                <Field orientation="horizontal">
                  <RadioGroupItem value="default" id="table-size-default" />
                  <FieldLabel className="font-normal">Default</FieldLabel>
                  <FieldDescription>2 × 2</FieldDescription>
                </Field>
                <Field orientation="horizontal">
                  <RadioGroupItem value="custom" id="table-size-custom" />
                  <FieldLabel className="font-normal">Custom</FieldLabel>
                </Field>
                {sizeMode === "custom" && (
                  <div className="flex gap-2 pl-6">
                    <Field>
                      <FieldLabel
                        htmlFor="table-size-rows"
                        className="font-normal"
                      >
                        Rows
                      </FieldLabel>
                      <Input
                        id="table-size-rows"
                        type="number"
                        min={1}
                        max={MAX_TABLE_DIMENSION}
                        value={customRows}
                        onChange={(e) => setCustomRows(Number(e.target.value))}
                      />
                    </Field>
                    <Field>
                      <FieldLabel
                        htmlFor="table-size-cols"
                        className="font-normal"
                      >
                        Columns
                      </FieldLabel>
                      <Input
                        id="table-size-cols"
                        type="number"
                        min={1}
                        max={MAX_TABLE_DIMENSION}
                        value={customCols}
                        onChange={(e) => setCustomCols(Number(e.target.value))}
                      />
                    </Field>
                  </div>
                )}
              </RadioGroup>
            </FieldSet>
            <FieldDescription>
              {totalTables} table{totalTables === 1 ? "" : "s"} total
              {neededNewTables > 0 && `, ${neededNewTables} new`}
            </FieldDescription>
            {totalTables > RANDOMIZE_TABLE_COUNT_WARNING_THRESHOLD && (
              <Alert>
                <AlertDescription>
                  This will create a lot of tables. Are you sure?
                </AlertDescription>
              </Alert>
            )}
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={isSubmitting || studentCount === 0}>
              {isSubmitting && <Spinner />}
              Generate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function BoundarySizeDialog({
  boundary,
  tables,
  onSave,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  boundary: { width: number; height: number }
  tables: TableGeometry[]
  onSave: (boundary: { width: number; height: number }) => void
}) {
  const min = getBoundaryMinSize(tables)
  const [width, setWidth] = useState(boundary.width)
  const [height, setHeight] = useState(boundary.height)

  useEffect(() => {
    if (!props.open) {
      return
    }
    setWidth(boundary.width)
    setHeight(boundary.height)
  }, [props.open])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    onSave({
      width: Math.max(min.width, width),
      height: Math.max(min.height, height),
    })
  }

  return (
    <Dialog {...props}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Boundary Size</DialogTitle>
            <DialogDescription>
              Nothing is saved until you click Save.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="boundary-width">Width</FieldLabel>
              <Input
                id="boundary-width"
                type="number"
                min={min.width}
                step={GRID_STEP}
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="boundary-height">Height</FieldLabel>
              <Input
                id="boundary-height"
                type="number"
                min={min.height}
                step={GRID_STEP}
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function UnassignAllDialog({
  onUnassignAll,
  ...props
}: React.ComponentProps<typeof AlertDialog> & {
  onUnassignAll: () => void
}) {
  return (
    <AlertDialog {...props}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
            <UsersRoundIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>Unassign all students?</AlertDialogTitle>
          <AlertDialogDescription>
            This clears every seat assignment on this chart. It isn't saved
            until you click Save.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline">Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onUnassignAll}>
            Unassign All
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default function Component({ loaderData }: Route.ComponentProps) {
  const { classroom, students, seatingChart } = loaderData

  const [locked, setLocked] = useState(true)
  const [randomChartOpen, setRandomChartOpen] = useState(false)
  const [unassignAllOpen, setUnassignAllOpen] = useState(false)
  const [boundarySizeOpen, setBoundarySizeOpen] = useState(false)
  const [boundary, setBoundary] = useState({
    width: classroom.boundary_width,
    height: classroom.boundary_height,
  })

  const studentsById = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students]
  )

  const initialNodes = useMemo(
    () => buildInitialNodes(classroom.id, seatingChart, studentsById),
    []
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const canvasRef = useRef<SeatingChartCanvasHandle>(null)
  const [fitViewPending, setFitViewPending] = useState(false)

  const fetcher = useFetcher<typeof action>()
  const boundaryFetcher = useFetcher<typeof editClassroomAction>()
  const savingBoundary = boundaryFetcher.state !== "idle"
  const saveError =
    (boundaryFetcher.data && !boundaryFetcher.data.ok
      ? boundaryFetcher.data.error
      : null) ?? (fetcher.data && !fetcher.data.ok ? fetcher.data.error : null)

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) {
      return
    }
    setLocked(fetcher.data.ok)
  }, [fetcher.state, fetcher.data])

  // Deferred to an effect (rather than called inline) so it runs after the
  // canvas has re-rendered with the new boundary, not against stale nodes
  // from before this render's setBoundary took effect.
  useEffect(() => {
    if (!fitViewPending) {
      return
    }
    canvasRef.current?.fitView()
    setFitViewPending(false)
  }, [fitViewPending])

  // PATCH the boundary first; only PUT the seating chart once that succeeds,
  // so a failed boundary save never leaves tables persisted without it.
  useEffect(() => {
    if (boundaryFetcher.state !== "idle" || !boundaryFetcher.data) {
      return
    }
    if (!boundaryFetcher.data.ok) {
      return
    }
    setFitViewPending(true)
    const payload = buildSeatingChartPayload(nodes)
    fetcher.submit(payload, { method: "post", encType: "application/json" })
  }, [boundaryFetcher.state, boundaryFetcher.data])

  const unassigned = useMemo(
    () => getUnassignedStudents(students, nodes),
    [students, nodes]
  )

  function handleSave() {
    setNodes((nds) =>
      nds.map((n) => (n.selected ? { ...n, selected: false } : n))
    )
    boundaryFetcher.submit(
      { boundary_width: boundary.width, boundary_height: boundary.height },
      {
        method: "post",
        action: `/classrooms/${classroom.id}/edit`,
        encType: "application/json",
      }
    )
  }

  function handleCancel() {
    setNodes(buildInitialNodes(classroom.id, seatingChart, studentsById))
    setBoundary({
      width: classroom.boundary_width,
      height: classroom.boundary_height,
    })
    setLocked(true)
  }

  function handleAddTable() {
    const tableNumber = nodes.filter((n) => n.type === "table").length
    const position = findNewTablePosition(
      boundary,
      getTableGeometry(nodes),
      DEFAULT_TABLE_ROWS,
      DEFAULT_TABLE_COLS
    )
    if (!position) {
      toast.error("Not enough room for a new table")
      return
    }
    const table = createCanvasTable(position)

    const tableNode: SeatingChartTableNode = {
      id: table.id,
      type: "table",
      position: { x: table.x_pos, y: table.y_pos },
      deletable: false,
      data: { table_number: tableNumber, rows: table.rows, cols: table.cols },
    }
    const seatNodes: SeatingChartSeatNode[] = []
    for (let row = 0; row < table.rows; row++) {
      for (let col = 0; col < table.cols; col++) {
        seatNodes.push({
          id: getSeatId(table.id, row, col),
          type: "seat",
          position: getSeatPosition(row, col),
          parentId: table.id,
          draggable: false,
          selectable: false,
          deletable: false,
          data: { row, col },
        })
      }
    }

    // Order nodes so that parent nodes always come before child nodes
    setNodes((nds) => reorderNodes([...nds, tableNode, ...seatNodes]))
  }

  function handleUnassignAll() {
    setNodes((nds) => nds.filter((n) => n.type !== "student"))
    setUnassignAllOpen(false)
  }

  const keptTables = useMemo(() => getTableGeometry(nodes), [nodes])

  function handleRandomize(chart: SeatingChart) {
    setNodes(buildInitialNodes(classroom.id, chart, studentsById))
    setRandomChartOpen(false)
  }

  function handleBoundarySave(newBoundary: { width: number; height: number }) {
    setBoundary(newBoundary)
    setBoundarySizeOpen(false)
    setFitViewPending(true)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0">
        <Button
          variant="link"
          size="sm"
          className="mb-1 px-0 text-muted-foreground"
          render={<Link to="/classrooms" />}
        >
          <ArrowLeftIcon />
          <span>Classrooms</span>
        </Button>
        <h2 className="text-2xl font-medium">Period {classroom.period}</h2>
        <h3 className="text-sm text-muted-foreground">{classroom.subject}</h3>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 pb-2">
        {saveError && (
          <Alert variant="destructive" className="mr-auto py-2">
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        )}
        <ButtonGroup>
          <ButtonGroup>
            {locked ? (
              <Button
                variant="secondary"
                onClick={() => setLocked(false)}
                aria-label="Edit seating chart"
              >
                Edit Chart
              </Button>
            ) : (
              <>
                <Button
                  disabled={fetcher.state !== "idle" || savingBoundary}
                  variant="secondary"
                  onClick={handleCancel}
                  aria-label="Cancel seating chart changes"
                >
                  Cancel
                </Button>
                <Button
                  disabled={fetcher.state !== "idle" || savingBoundary}
                  onClick={handleSave}
                  aria-label="Save seating chart"
                >
                  {(fetcher.state !== "idle" || savingBoundary) && <Spinner />}
                  Save
                </Button>
              </>
            )}
          </ButtonGroup>
          <ButtonGroup>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label="More Options"
                  >
                    <MoreHorizontalIcon />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-full">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Classroom</DropdownMenuLabel>
                  <DropdownMenuItem aria-label="Edit Classroom">
                    <Edit2Icon /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem aria-label="Manage Students">
                    <UsersIcon /> Manage Students
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Seating Chart</DropdownMenuLabel>
                  <DropdownMenuItem
                    disabled={locked}
                    onClick={handleAddTable}
                    aria-label="Add Table"
                  >
                    <TableIcon /> Add Table
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={locked}
                    onClick={() => setRandomChartOpen(true)}
                    aria-label="Randomize Seating Chart"
                  >
                    <ShuffleIcon /> Randomize
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={locked}
                    onClick={() => setBoundarySizeOpen(true)}
                    aria-label="Boundary Size"
                  >
                    <Maximize2Icon /> Boundary Size
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={locked}
                    variant="destructive"
                    aria-label="Unassign All Students"
                    onClick={() => setUnassignAllOpen(true)}
                  >
                    <UserXIcon /> Unassign All
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    aria-label="Delete Classroom"
                  >
                    <Trash2Icon /> Delete Classroom
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>
        </ButtonGroup>
      </div>
      <div>
        <RandomSeatingChartDialog
          open={randomChartOpen}
          onOpenChange={setRandomChartOpen}
          classroomId={classroom.id}
          studentCount={students.length}
          keptTables={keptTables}
          boundary={boundary}
          onGenerate={handleRandomize}
        />
        <BoundarySizeDialog
          open={boundarySizeOpen}
          onOpenChange={setBoundarySizeOpen}
          boundary={boundary}
          onSave={handleBoundarySave}
          tables={keptTables}
        />
        <UnassignAllDialog
          open={unassignAllOpen}
          onOpenChange={setUnassignAllOpen}
          onUnassignAll={handleUnassignAll}
        />
      </div>
      <div className="flex min-h-0 w-full flex-1 flex-col gap-2 md:flex-row">
        <RosterPanel students={unassigned} locked={locked} />
        <SeatingChartCanvas
          ref={canvasRef}
          nodes={nodes}
          onNodesChange={onNodesChange}
          setNodes={setNodes}
          locked={locked}
          studentsById={studentsById}
          boundary={boundary}
        />
      </div>
    </div>
  )
}
