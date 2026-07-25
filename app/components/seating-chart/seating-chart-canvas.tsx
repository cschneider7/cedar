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
  Trash2Icon,
  UsersIcon,
  UserXIcon,
} from "lucide-react"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useFetcher } from "react-router"
import { toast } from "sonner"
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { Spinner } from "~/components/ui/spinner"
import type { SeatingChart, Student } from "~/lib/schemas"
import {
  BOUNDARY_NODE_ID,
  boundaryArea,
  buildInitialNodes,
  buildSeatingChartPayload,
  CANVAS_PADDING,
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
import {
  BoundarySizeDialog,
  RandomSeatingChartDialog,
  UnassignAllDialog,
} from "./seating-chart-dialogs"
import { RosterPanel, STUDENT_DATA_TRANSFER_TYPE } from "./seating-chart-roster"

const nodeTypes = {
  table: TableNode,
  seat: SeatNode,
  student: StudentNode,
  boundary: BoundaryNode,
}

interface SeatingChartCanvasProps {
  classroomId: string
  seatingChart: SeatingChart
  students: Student[]
}

type DragSnapshot = { parentId?: string; position: Point }

/** The interactive seating chart editor: toolbar, dialogs, roster, and canvas. */
function SeatingChartEditor({
  classroomId,
  seatingChart,
  students,
}: SeatingChartCanvasProps) {
  const {
    getIntersectingNodes,
    getInternalNode,
    screenToFlowPosition,
    fitView,
  } = useReactFlow<SeatingChartNode>()

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

  // Handle locking/unlocking the canvas
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) {
      return
    }
    setLocked(fetcher.data.ok)
  }, [fetcher.state, fetcher.data])

  const boundary = useMemo(() => getBoundary(nodes), [nodes])
  const existingTables = useMemo(() => getTableGeometry(nodes), [nodes])
  const unassignedStudents = useMemo(
    () => getUnassignedStudents(students, nodes),
    [students, nodes]
  )

  // Fit the viewport to the boundary
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

  // Create a table node
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

  // Remove all student nodes from the canvas
  function handleUnassignAll() {
    setNodes((nds) => nds.filter((n) => n.type !== "student"))
    setUnassignAllOpen(false)
  }

  // Construct a randomized seating chart
  function handleRandomize(chart: SeatingChart) {
    setNodes(buildInitialNodes(classroomId, chart, studentsById))
    fitView({ nodes: [{ id: BOUNDARY_NODE_ID }] })
    setRandomChartOpen(false)
  }

  // Update the seating chart boundary
  function handleBoundarySave(boundary: { width: number; height: number }) {
    setNodes((nds) =>
      nds.map((n) =>
        n.type === "boundary"
          ? { ...n, ...boundary, data: boundary }
          : n.type === "table"
            ? { ...n, extent: boundaryArea(boundary) }
            : n
      )
    )
    setBoundarySizeOpen(false)
    fitView({ nodes: [{ id: BOUNDARY_NODE_ID }] })
  }

  // Captures a dragged student's parentId/position before a drag
  const dragStartState = useRef(new Map<string, DragSnapshot>())

  // Clears any node highlighting
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

  // Handle dragging a student from the unassigned list
  const onDragOver = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      if (!locked) {
        event.dataTransfer.dropEffect = "move"
      }
    },
    [locked]
  )

  // Handle dropping a student onto the canvas
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      if (locked) {
        return
      }

      const studentId = event.dataTransfer.getData(STUDENT_DATA_TRANSFER_TYPE)
      const student = studentsById.get(studentId)
      if (!student) {
        return
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
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
              data: { student },
            }
          : {
              id: studentId,
              type: "student",
              position: { x: rectangle.x, y: rectangle.y },
              deletable: false,
              data: { student },
            }

      setNodes((nds) => nds.concat(studentNode))
    },
    [
      locked,
      studentsById,
      screenToFlowPosition,
      getIntersectingNodes,
      nodes,
      setNodes,
    ]
  )

  const canvasArea = useMemo<[[number, number], [number, number]]>(
    () => [
      [-CANVAS_PADDING, -CANVAS_PADDING],
      [boundary.width + CANVAS_PADDING, boundary.height + CANVAS_PADDING],
    ],
    [boundary]
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
      </div>
      <div className="flex min-h-0 w-full flex-1 flex-col gap-2 md:flex-row">
        <RosterPanel students={unassignedStudents} locked={locked} />
        <div className="relative min-h-0 w-full flex-1 overflow-hidden rounded-lg border-2">
          <LockedContext value={locked}>
            <ReactFlow
              nodes={nodes}
              onNodesChange={onNodesChange}
              nodeTypes={nodeTypes}
              onNodeDragStart={onNodeDragStart}
              onNodeDrag={onNodeDrag}
              onNodeDragStop={onNodeDragStop}
              onDrop={onDrop}
              onDragOver={onDragOver}
              nodesDraggable={!locked}
              elementsSelectable={!locked}
              translateExtent={canvasArea}
              snapToGrid
              snapGrid={[GRID_STEP, GRID_STEP]}
              minZoom={0.25}
              maxZoom={2}
            >
              <Background gap={GRID_STEP} size={2} />
            </ReactFlow>
            <Controls showInteractive={false} />
          </LockedContext>
        </div>
      </div>
    </div>
  )
}

/** Thin `ReactFlowProvider` wrapper around the seating chart editor. */
export function SeatingChartCanvas(props: SeatingChartCanvasProps) {
  return (
    <ReactFlowProvider>
      <SeatingChartEditor {...props} />
    </ReactFlowProvider>
  )
}
