import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type OnNodeDrag,
  type OnNodesChange,
} from "@xyflow/react"
import React, {
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react"
import { BoundaryNode } from "~/components/nodes/boundary-node"
import { BoundaryContext, LockedContext } from "~/components/nodes/context"
import { SeatNode } from "~/components/nodes/seat-node"
import { StudentCardContent } from "~/components/nodes/student-card-content"
import { StudentNode } from "~/components/nodes/student-node"
import { TableNode } from "~/components/nodes/table-node"
import { Empty, EmptyDescription } from "~/components/ui/empty"
import { Item } from "~/components/ui/item"
import { ScrollArea } from "~/components/ui/scroll-area"
import type { Student } from "~/lib/schemas"
import {
  GRID_STEP,
  reorderNodes,
  STUDENT_NODE_SIZE,
  type Point,
  type SeatingChartNode,
  type SeatingChartStudentNode,
} from "~/lib/seating-chart-utils"

const nodeTypes = {
  table: TableNode,
  seat: SeatNode,
  student: StudentNode,
  boundary: BoundaryNode,
}

const STUDENT_DATA_TRANSFER_TYPE = "application/x-student-id"
const CANVAS_PADDING = 1000

function StudentChip({
  student,
  locked,
}: {
  student: Student
  locked: boolean
}) {
  return (
    <Item
      variant="outline"
      size="xs"
      draggable={!locked}
      onDragStart={(e) => {
        e.dataTransfer.setData(STUDENT_DATA_TRANSFER_TYPE, student.id)
        e.dataTransfer.effectAllowed = "move"
      }}
      className="aspect-square w-24 shrink-0 overflow-hidden"
    >
      <StudentCardContent student={student} />
    </Item>
  )
}

export function RosterPanel({
  students,
  locked,
}: {
  students: Student[]
  locked: boolean
}) {
  return (
    <div className="h-40 shrink-0 rounded-lg border p-1 md:h-full">
      <ScrollArea className="h-full">
        <div className="h-full min-h-0 w-full shrink-0 p-3 transition-shadow md:w-45">
          <h4 className="mb-4 text-sm leading-none font-medium">
            Unassigned ({students.length})
          </h4>
          <div className="flex flex-wrap justify-center gap-3">
            {students.length === 0 ? (
              <Empty className="gap-0 rounded-none border-none p-0">
                <EmptyDescription>Empty</EmptyDescription>
              </Empty>
            ) : (
              students.map((student) => (
                <StudentChip
                  key={student.id}
                  student={student}
                  locked={locked}
                />
              ))
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}

interface SeatingChartCanvasProps {
  nodes: SeatingChartNode[]
  onNodesChange: OnNodesChange<SeatingChartNode>
  setNodes: Dispatch<SetStateAction<SeatingChartNode[]>>
  locked: boolean
  studentsById: Map<string, Student>
  boundary: { width: number; height: number }
  ref?: React.Ref<SeatingChartCanvasHandle>
}

export type SeatingChartCanvasHandle = {
  fitView: () => void
}

type DragSnapshot = { parentId?: string; position: Point }

function SeatingChartFlow({
  nodes,
  onNodesChange,
  setNodes,
  locked,
  studentsById,
  boundary,
  ref,
}: SeatingChartCanvasProps) {
  const {
    getIntersectingNodes,
    getInternalNode,
    screenToFlowPosition,
    fitView,
  } = useReactFlow<SeatingChartNode>()

  useImperativeHandle(ref, () => ({ fitView: () => fitView() }), [fitView])

  // The synthetic boundary node isn't part of `nodes` state (it's derived
  // from the `boundary` prop), so forwarding its own dimension-change events
  // back into `onNodesChange` would produce a same-content-but-new-array
  // update on every measurement, causing `displayNodes` to recompute and the
  // boundary to be remeasured again -- an infinite loop.
  const handleNodesChange: OnNodesChange<SeatingChartNode> = useCallback(
    (changes) => {
      const relevant = changes.filter(
        (c) => !("id" in c) || c.id !== "__boundary__"
      )
      if (relevant.length > 0) {
        onNodesChange(relevant)
      }
    },
    [onNodesChange]
  )

  // Captures a dragged student's parentId/position before a drag
  const dragStartState = useRef(new Map<string, DragSnapshot>())

  const clearHighlights = useCallback(
    (nds: SeatingChartNode[]) =>
      nds.map((n) => (n.className ? { ...n, className: "" } : n)),
    []
  )

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

  const onNodeDragStop: OnNodeDrag<SeatingChartNode> = useCallback(
    (_, node) => {
      if (node.type !== "student") {
        return
      }

      const committed = dragStartState.current.get(node.id)
      dragStartState.current.delete(node.id)

      const cancelMovement = () => {
        setNodes((nds) =>
          clearHighlights(
            nds.map((n) =>
              n.type === "student" && n.id === node.id && committed
                ? { ...n, ...committed }
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

  const onDragOver = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      if (!locked) {
        event.dataTransfer.dropEffect = "move"
      }
    },
    [locked]
  )

  // Handle dragging a student from the unassigned list onto the canvas
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
      const dropRect = {
        x: position.x - STUDENT_NODE_SIZE / 2,
        y: position.y - STUDENT_NODE_SIZE / 2,
        width: STUDENT_NODE_SIZE,
        height: STUDENT_NODE_SIZE,
      }

      const intersectingNodes = getIntersectingNodes(dropRect).find(
        (n) => n.type === "seat"
      )
      const studentInSeat =
        !!intersectingNodes &&
        nodes.some(
          (n) => n.type === "student" && n.parentId === intersectingNodes.id
        )

      const newNode: SeatingChartStudentNode =
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
              position: { x: dropRect.x, y: dropRect.y },
              deletable: false,
              data: { student },
            }

      setNodes((nds) => nds.concat(newNode))
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

  const displayNodes = useMemo(() => {
    const boundaryNode = {
      id: "__boundary__",
      type: "boundary" as const,
      position: { x: 0, y: 0 },
      width: boundary.width,
      height: boundary.height,
      draggable: false,
      selectable: false,
      deletable: false,
      zIndex: -1,
      data: {
        width: boundary.width,
        height: boundary.height,
      },
    }

    // Restrict table nodes to boundary node
    const updatedNodes = nodes.map((n) => {
      if (n.type !== "table") {
        return n
      }
      return {
        ...n,
        extent: [
          [0, 0],
          [boundary.width, boundary.height],
        ] as [[number, number], [number, number]],
      }
    })
    return [boundaryNode, ...updatedNodes] as unknown as SeatingChartNode[]
  }, [nodes, boundary])

  const translateExtent = useMemo<[[number, number], [number, number]]>(
    () => [
      [-CANVAS_PADDING, -CANVAS_PADDING],
      [boundary.width + CANVAS_PADDING, boundary.height + CANVAS_PADDING],
    ],
    [boundary]
  )

  return (
    <div className="relative min-h-0 w-full flex-1 overflow-hidden rounded-lg border-2">
      <LockedContext value={locked}>
        <BoundaryContext value={boundary}>
          <ReactFlow
            nodes={displayNodes}
            onNodesChange={handleNodesChange}
            nodeTypes={nodeTypes}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodesDraggable={!locked}
            elementsSelectable={!locked}
            translateExtent={translateExtent}
            fitView
            snapToGrid
            snapGrid={[GRID_STEP, GRID_STEP]}
            minZoom={0.25}
            maxZoom={2}
          >
            <Background gap={GRID_STEP} size={2} />
          </ReactFlow>
          <Controls showInteractive={false} />
        </BoundaryContext>
      </LockedContext>
    </div>
  )
}

export function SeatingChartCanvas({ ref, ...props }: SeatingChartCanvasProps) {
  return (
    <ReactFlowProvider>
      <SeatingChartFlow {...props} ref={ref} />
    </ReactFlowProvider>
  )
}
