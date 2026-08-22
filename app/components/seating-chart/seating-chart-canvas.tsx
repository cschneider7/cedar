import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type OnNodeDrag,
} from "@xyflow/react"
import {
  Edit2Icon,
  Maximize2Icon,
  MoreHorizontalIcon,
  ShuffleIcon,
  TableIcon,
  UserXIcon,
} from "lucide-react"
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useBeforeUnload, useBlocker, useFetcher } from "react-router"
import { BoundaryNode } from "~/components/seating-chart/boundary-node"
import { LockedContext } from "~/components/seating-chart/context"
import { SeatNode } from "~/components/seating-chart/seat-node"
import { StudentNode } from "~/components/seating-chart/student-node"
import { TableNode } from "~/components/seating-chart/table-node"
import { Alert, AlertDescription } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import { ButtonGroup } from "~/components/ui/button-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { Spinner } from "~/components/ui/spinner"
import { toast } from "~/components/ui/toast"
import type { SeatingChart, Student } from "~/lib/schemas"
import {
  BOUNDARY_NODE_ID,
  boundaryArea,
  buildInitialNodes,
  buildSeatingChartPayload,
  canvasExtent,
  createCanvasTable,
  DEFAULT_TABLE_COLS,
  DEFAULT_TABLE_ROWS,
  findNewTablePosition,
  getBoundary,
  getSeatId,
  getSeatPosition,
  getTableGeometry,
  getUnassignedStudents,
  GRID_STEP,
  reorderNodes,
  STUDENT_NODE_SIZE,
  type Point,
  type SeatingChartNode,
  type SeatingChartSeatNode,
  type SeatingChartStudentNode,
  type SeatingChartTableNode,
} from "~/lib/seating-chart-utils"
import type { action as classroomAction } from "~/routes/classrooms/classroom"
import { UnsavedChartChangesDialog } from "../classroom/unsaved-chart-changes-dialog"
import {
  BoundarySizeDialog,
  RandomSeatingChartDialog,
  UnassignAllDialog,
} from "./seating-chart-dialogs"
import { RosterPanel, StudentChipOverlay } from "./seating-chart-roster"

export const nodeTypes = {
  table: TableNode,
  seat: SeatNode,
  student: StudentNode,
  boundary: BoundaryNode,
}

const CANVAS_DROPPABLE_ID = "seating-chart-canvas"

/**
 * Marks the canvas as a drop target for roster chips.
 */
function CanvasDropZone({
  disabled,
  className,
  children,
}: {
  disabled: boolean
  className?: string
  children: ReactNode
}) {
  // Must be its own component, rendered as a DndContext descendant — calling
  // useDroppable directly in SeatingChartEditor would register against nothing.
  const { setNodeRef } = useDroppable({ id: CANVAS_DROPPABLE_ID, disabled })
  return (
    <div ref={setNodeRef} className={className}>
      {children}
    </div>
  )
}

interface SeatingChartCanvasProps {
  classroomId: string
  seatingChart: SeatingChart
  students: Student[]
  onLockedChange?: (locked: boolean) => void
}

export type SeatingChartCanvasHandle = { discardChanges: () => void }

type DragSnapshot = { parentId?: string; position: Point }

/**
 * The interactive seating chart editor: toolbar, dialogs, roster, and canvas.
 */
const SeatingChartEditor = forwardRef<
  SeatingChartCanvasHandle,
  SeatingChartCanvasProps
>(function SeatingChartEditor(
  { classroomId, seatingChart, students, onLockedChange },
  ref
) {
  const {
    getIntersectingNodes,
    getInternalNode,
    screenToFlowPosition,
    fitView,
  } = useReactFlow<SeatingChartNode>()

  // A distance constraint can't tell a scroll-swipe from drag-intent on touch;
  // delay+tolerance lets a quick swipe still scroll the roster's ScrollArea.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 80, tolerance: 8 },
    })
  )
  const [activeStudent, setActiveStudent] = useState<Student | null>(null)

  const studentsById = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students]
  )

  const initialNodes = useMemo(
    () => buildInitialNodes(classroomId, seatingChart, studentsById),
    []
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [locked, setLocked] = useState(true)
  const [randomChartOpen, setRandomChartOpen] = useState(false)
  const [unassignAllOpen, setUnassignAllOpen] = useState(false)
  const [boundarySizeOpen, setBoundarySizeOpen] = useState(false)

  const fetcher = useFetcher<typeof classroomAction>()
  const saveError = fetcher.data && !fetcher.data.ok ? fetcher.data.error : null
  const isSaving = fetcher.state !== "idle"
  // Also excludes an in-flight save — otherwise a drag mid-save would be
  // silently discarded once the request resolves and re-locks over stale state.
  const isEditable = !locked && !isSaving

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) {
      return
    }
    setLocked(fetcher.data.ok)
  }, [fetcher.state, fetcher.data])

  // Mirrors `locked` up to the classroom page so it can guard switching away
  // to another tab while a chart edit is in progress.
  useEffect(() => {
    onLockedChange?.(locked)
  }, [locked, onLockedChange])

  // Keeps the canvas in sync with roster changes made elsewhere (e.g. the
  // Roster tab assigning/unassigning a student) as long as there's no
  // in-progress edit here to clobber.
  useEffect(() => {
    if (locked) {
      setNodes(buildInitialNodes(classroomId, seatingChart, studentsById))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, seatingChart, studentsById])

  const boundary = useMemo(() => getBoundary(nodes), [nodes])
  const canvasArea = useMemo(() => canvasExtent(boundary), [boundary])
  const existingTables = useMemo(() => getTableGeometry(nodes), [nodes])
  const unassignedStudents = useMemo(
    () => getUnassignedStudents(students, nodes),
    [students, nodes]
  )

  useEffect(() => {
    fitView({ nodes: [{ id: BOUNDARY_NODE_ID }] })
  }, [])

  function handleSave() {
    setNodes((nds) =>
      nds.map((n) => (n.selected ? { ...n, selected: false } : n))
    )
    const payload = buildSeatingChartPayload(nodes)
    fetcher.submit(payload, { method: "post", encType: "application/json" })
    fitView({ nodes: [{ id: BOUNDARY_NODE_ID }] })
  }

  function handleCancel() {
    setNodes(buildInitialNodes(classroomId, seatingChart, studentsById))
    fitView({ nodes: [{ id: BOUNDARY_NODE_ID }] })
    setLocked(true)
  }

  useImperativeHandle(ref, () => ({ discardChanges: handleCancel }), [
    handleCancel,
  ])

  // Real navigation away from this route (sidebar link, browser back/forward)
  // while there's an unsaved edit. Only fires on an actual pathname change —
  // not a same-route `?tab=` switch, which the classroom page's own guard
  // handles explicitly instead (see UnsavedChartChangesDialog usage below).
  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) =>
        !locked && currentLocation.pathname !== nextLocation.pathname,
      [locked]
    )
  )

  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (!locked) {
          event.preventDefault()
        }
      },
      [locked]
    )
  )

  function handleAddTable() {
    const tableNumber = nodes.filter((n) => n.type === "table").length
    const position = findNewTablePosition(
      boundary,
      getTableGeometry(nodes),
      DEFAULT_TABLE_ROWS,
      DEFAULT_TABLE_COLS
    )
    if (!position) {
      toast.add({ title: "Not enough room for a new table", type: "error" })
      return
    }
    const table = createCanvasTable(position)

    const tableNode: SeatingChartTableNode = {
      id: table.id,
      type: "table",
      position: { x: table.x_pos, y: table.y_pos },
      deletable: false,
      extent: boundaryArea(boundary),
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

  function handleRandomize(chart: SeatingChart) {
    setNodes(buildInitialNodes(classroomId, chart, studentsById))
    fitView({ nodes: [{ id: BOUNDARY_NODE_ID }] })
    setRandomChartOpen(false)
  }

  function handleBoundarySave(boundary: { width: number; height: number }) {
    setNodes((nds) =>
      nds.map((n) =>
        n.type === "boundary"
          ? { ...n, ...boundary, data: boundary }
          : n.type === "table"
            ? { ...n, extent: boundaryArea(boundary) }
            : n.type === "student"
              ? { ...n, extent: canvasExtent(boundary) }
              : n
      )
    )
    setBoundarySizeOpen(false)
    fitView({ nodes: [{ id: BOUNDARY_NODE_ID }] })
  }

  // Captures a dragged student's parentId/position before a drag
  const dragStartState = useRef(new Map<string, DragSnapshot>())

  const clearHighlights = useCallback(
    (nds: SeatingChartNode[]) =>
      nds.map((n) => (n.className ? { ...n, className: "" } : n)),
    []
  )

  // When starting to drag a student node, record its initial position
  const onNodeDragStart: OnNodeDrag<SeatingChartNode> = useCallback(
    (_, node) => {
      if (node.type !== "student") {
        return
      }
      dragStartState.current.set(node.id, {
        parentId: node.parentId,
        position: node.position,
      })
    },
    []
  )

  // While dragging a student node and intersecting a seat, highlight the seat
  const onNodeDrag: OnNodeDrag<SeatingChartNode> = useCallback(
    (_, node) => {
      if (node.type !== "student") {
        return
      }

      const seatNode = getIntersectingNodes(node).find((n) => n.type === "seat")
      const occupied =
        !!seatNode &&
        nodes.some(
          (n) =>
            n.type === "student" &&
            n.parentId === seatNode.id &&
            n.id !== node.id
        )

      setNodes((nds) =>
        nds.map((n) => {
          const className =
            seatNode?.id !== n.id
              ? ""
              : occupied
                ? "highlight-rejected"
                : "highlight"
          return n.className === className ? n : { ...n, className }
        })
      )
    },
    [nodes, getIntersectingNodes, setNodes]
  )

  // After letting go of a student node, check if it's within bounds of a seat and assign to it if possible
  const onNodeDragStop: OnNodeDrag<SeatingChartNode> = useCallback(
    (_, node) => {
      if (node.type !== "student") {
        return
      }

      const startPos = dragStartState.current.get(node.id)
      dragStartState.current.delete(node.id)

      const cancelMovement = () => {
        setNodes((nds) =>
          clearHighlights(
            nds.map((n) =>
              n.type === "student" && n.id === node.id && startPos
                ? { ...n, ...startPos }
                : n
            )
          )
        )
      }

      const seatNode = getIntersectingNodes(node).find((n) => n.type === "seat")

      if (seatNode) {
        const occupant = nodes.find(
          (n) =>
            n.type === "student" &&
            n.parentId === seatNode.id &&
            n.id !== node.id
        )

        // If another student was already assigned that seat, cancel the movement
        if (occupant) {
          cancelMovement()
          return
        }

        setNodes((nds) =>
          reorderNodes(
            nds.map((n) =>
              n.type === "student" && n.id === node.id
                ? { ...n, parentId: seatNode.id, position: { x: 0, y: 0 } }
                : n
            )
          )
        )
      } else if (node.parentId) {
        const absolutePosition =
          getInternalNode(node.id)?.internals.positionAbsolute ?? node.position
        setNodes((nds) =>
          nds.map((n) =>
            n.type === "student" && n.id === node.id
              ? { ...n, parentId: undefined, position: absolutePosition }
              : n
          )
        )
      }

      setNodes((nds) => clearHighlights(nds))
    },
    [nodes, getIntersectingNodes, getInternalNode, setNodes, clearHighlights]
  )

  // Track which student is being dragged so DragOverlay can render its preview
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveStudent(studentsById.get(String(event.active.id)) ?? null)
    },
    [studentsById]
  )

  // Handle dropping a student from the unassigned list onto the canvas
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveStudent(null)
      if (locked || event.over?.id !== CANVAS_DROPPABLE_ID) {
        return
      }

      const studentId = String(event.active.id)
      const student = studentsById.get(studentId)
      if (!student) {
        return
      }

      // activatorEvent is the PointerEvent at drag start; delta is the total
      // movement since then, together giving the drop's screen coordinates.
      const activatorEvent = event.activatorEvent as PointerEvent
      const position = screenToFlowPosition({
        x: activatorEvent.clientX + event.delta.x,
        y: activatorEvent.clientY + event.delta.y,
      })
      const rectangle = {
        x: position.x - STUDENT_NODE_SIZE / 2,
        y: position.y - STUDENT_NODE_SIZE / 2,
        width: STUDENT_NODE_SIZE,
        height: STUDENT_NODE_SIZE,
      }

      const intersectingNodes = getIntersectingNodes(rectangle).find(
        (n) => n.type === "seat"
      )
      const studentInSeat =
        !!intersectingNodes &&
        nodes.some(
          (n) => n.type === "student" && n.parentId === intersectingNodes.id
        )

      const studentNode: SeatingChartStudentNode =
        intersectingNodes && !studentInSeat
          ? {
              id: studentId,
              type: "student",
              position: { x: 0, y: 0 },
              parentId: intersectingNodes.id,
              deletable: false,
              extent: canvasArea,
              data: { student },
            }
          : {
              id: studentId,
              type: "student",
              position: { x: rectangle.x, y: rectangle.y },
              deletable: false,
              extent: canvasArea,
              data: { student },
            }

      setNodes((nds) => nds.concat(studentNode))
    },
    [
      locked,
      studentsById,
      canvasArea,
      screenToFlowPosition,
      getIntersectingNodes,
      nodes,
      setNodes,
    ]
  )

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
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
                <Edit2Icon />
                Edit Chart
              </Button>
            ) : (
              <>
                <Button
                  disabled={fetcher.state !== "idle"}
                  variant="secondary"
                  onClick={handleCancel}
                  aria-label="Cancel seating chart changes"
                >
                  Cancel
                </Button>
                <Button
                  disabled={fetcher.state !== "idle"}
                  onClick={handleSave}
                  aria-label="Save seating chart"
                >
                  {fetcher.state !== "idle" && <Spinner />}
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
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={!isEditable}
                    onClick={handleAddTable}
                    aria-label="Add Table"
                  >
                    <TableIcon /> Add Table
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!isEditable}
                    onClick={() => setRandomChartOpen(true)}
                    aria-label="Randomize Seating Chart"
                  >
                    <ShuffleIcon /> Randomize
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!isEditable}
                    onClick={() => setBoundarySizeOpen(true)}
                    aria-label="Boundary Size"
                  >
                    <Maximize2Icon /> Boundary Size
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={!isEditable}
                    variant="destructive"
                    aria-label="Unassign All Students"
                    onClick={() => setUnassignAllOpen(true)}
                  >
                    <UserXIcon /> Unassign All
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
          classroomId={classroomId}
          studentCount={students.length}
          keptTables={existingTables}
          boundary={boundary}
          onGenerate={handleRandomize}
        />
        <BoundarySizeDialog
          open={boundarySizeOpen}
          onOpenChange={setBoundarySizeOpen}
          boundary={boundary}
          onSave={handleBoundarySave}
          tables={existingTables}
        />
        <UnassignAllDialog
          open={unassignAllOpen}
          onOpenChange={setUnassignAllOpen}
          onUnassignAll={handleUnassignAll}
        />
        <UnsavedChartChangesDialog
          open={blocker.state === "blocked"}
          onOpenChange={(open) => {
            if (!open) {
              blocker.reset?.()
            }
          }}
          onConfirmLeave={() => blocker.proceed?.()}
        />
      </div>
      <DndContext
        sensors={sensors}
        // The chip drag starts inside the roster's small ScrollArea; dnd-kit's
        // default auto-scroll otherwise tries to scroll that container toward
        // the pointer as it moves onto the canvas, corrupting the drop delta.
        autoScroll={false}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex min-h-0 w-full flex-1 flex-col gap-2 md:flex-row">
          <RosterPanel students={unassignedStudents} locked={!isEditable} />
          <CanvasDropZone
            disabled={!isEditable}
            className="relative min-h-0 w-full flex-1 overflow-hidden rounded-lg border-2"
          >
            <LockedContext value={!isEditable}>
              <ReactFlow
                nodes={nodes}
                onNodesChange={onNodesChange}
                nodeTypes={nodeTypes}
                onNodeDragStart={onNodeDragStart}
                onNodeDrag={onNodeDrag}
                onNodeDragStop={onNodeDragStop}
                nodesDraggable={isEditable}
                elementsSelectable={isEditable}
                translateExtent={canvasArea}
                snapToGrid
                snapGrid={[GRID_STEP, GRID_STEP]}
                minZoom={0.25}
                maxZoom={2}
              >
                <Background gap={GRID_STEP} size={2} />
              </ReactFlow>
              <Controls
                showInteractive={false}
                className="overflow-hidden rounded-lg border bg-card shadow-sm"
              />
            </LockedContext>
            {isSaving && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
                <Spinner className="size-6" />
              </div>
            )}
          </CanvasDropZone>
        </div>
        <DragOverlay>
          {activeStudent && <StudentChipOverlay student={activeStudent} />}
        </DragOverlay>
      </DndContext>
    </div>
  )
})

/**
 * Thin `ReactFlowProvider` wrapper around the seating chart editor.
 */
export const SeatingChartCanvas = forwardRef<
  SeatingChartCanvasHandle,
  SeatingChartCanvasProps
>(function SeatingChartCanvas(props, ref) {
  return (
    <ReactFlowProvider>
      <SeatingChartEditor {...props} ref={ref} />
    </ReactFlowProvider>
  )
})
