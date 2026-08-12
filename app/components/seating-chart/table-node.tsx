import {
  NodeToolbar,
  Position,
  useReactFlow,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import { GripVerticalIcon, MinusIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { memo, useState } from "react"
import { BaseNode, BaseNodeContent } from "~/components/base-node"
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
import { toast } from "~/components/ui/toast"
import {
  getBoundary,
  getSeatId,
  getSeatPosition,
  getTableNodeSize,
  MAX_TABLE_DIMENSION,
  TABLE_OFFSET,
  type SeatingChartNode,
  type SeatingChartSeatNode,
  type TableNodeData,
} from "~/lib/seating-chart-utils"

type PendingAction = "table" | "row" | "col" | null

/**
 * Returns a copy of the node list with one table's row/column counts updated.
 * @param nodes - List of table, seat, and student nodes
 * @param tableId - Id of the table node to update
 * @param rows - New number of seat rows for the table
 * @param cols - New number of seat columns for the table
 * @returns The node list with the matching table node's dimensions replaced
 */
function withTableDims(
  nodes: SeatingChartNode[],
  tableId: string,
  rows: number,
  cols: number
): SeatingChartNode[] {
  return nodes.map((n) =>
    n.id === tableId && n.type === "table"
      ? { ...n, data: { ...n.data, rows, cols } }
      : n
  )
}

/** Renders a table as a React Flow node, with a toolbar for resizing/deleting it. */
export const TableNode = memo(function TableNode({
  id,
  data,
  positionAbsoluteX,
  positionAbsoluteY,
}: NodeProps<Node<TableNodeData, "table">>) {
  const { setNodes, getNodes } = useReactFlow<SeatingChartNode>()
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)

  function seatsOccupied(seatIds: Set<string>) {
    return getNodes().some(
      (n) => n.type === "student" && n.parentId && seatIds.has(n.parentId)
    )
  }

  function removeTable() {
    setNodes((nds) => {
      const seatIds = new Set(
        nds
          .filter((n) => n.type === "seat" && n.parentId === id)
          .map((n) => n.id)
      )
      return nds.filter((n) => {
        if (n.id === id) return false
        if (n.type === "seat" && n.parentId === id) return false
        if (n.type === "student" && n.parentId && seatIds.has(n.parentId))
          return false
        return true
      })
    })
  }

  function handleAddRow() {
    if (data.rows >= MAX_TABLE_DIMENSION) return
    const { width, height } = getTableNodeSize(data.rows + 1, data.cols)
    const boundary = getBoundary(getNodes())
    if (
      positionAbsoluteX + width > boundary.width - TABLE_OFFSET ||
      positionAbsoluteY + height > boundary.height - TABLE_OFFSET
    ) {
      toast.add({ title: "Not enough room to grow this table", type: "error" })
      return
    }
    const newRow = data.rows
    setNodes((nds) => {
      const newSeats: SeatingChartSeatNode[] = Array.from(
        { length: data.cols },
        (_, col) => ({
          id: getSeatId(id, newRow, col),
          type: "seat",
          position: getSeatPosition(newRow, col),
          parentId: id,
          draggable: false,
          selectable: false,
          deletable: false,
          data: { row: newRow, col },
        })
      )
      return [...withTableDims(nds, id, data.rows + 1, data.cols), ...newSeats]
    })
  }

  function removeRow() {
    const removedRow = data.rows - 1
    setNodes((nds) => {
      const removedSeatIds = new Set(
        nds
          .filter(
            (n) =>
              n.type === "seat" &&
              n.parentId === id &&
              n.data.row === removedRow
          )
          .map((n) => n.id)
      )
      return withTableDims(nds, id, data.rows - 1, data.cols).filter((n) => {
        if (n.type === "seat" && removedSeatIds.has(n.id)) return false
        if (
          n.type === "student" &&
          n.parentId &&
          removedSeatIds.has(n.parentId)
        )
          return false
        return true
      })
    })
  }

  function handleRemoveRow() {
    if (data.rows <= 1) return
    const removedSeatIds = new Set(
      getNodes()
        .filter(
          (n) =>
            n.type === "seat" &&
            n.parentId === id &&
            n.data.row === data.rows - 1
        )
        .map((n) => n.id)
    )
    if (seatsOccupied(removedSeatIds)) {
      setPendingAction("row")
      return
    }
    removeRow()
  }

  function handleAddColumn() {
    if (data.cols >= MAX_TABLE_DIMENSION) return
    const { width, height } = getTableNodeSize(data.rows, data.cols + 1)
    const boundary = getBoundary(getNodes())
    if (
      positionAbsoluteX + width > boundary.width - TABLE_OFFSET ||
      positionAbsoluteY + height > boundary.height - TABLE_OFFSET
    ) {
      toast.add({ title: "Not enough room to grow this table", type: "error" })
      return
    }
    const newCol = data.cols
    setNodes((nds) => {
      const newSeats: SeatingChartSeatNode[] = Array.from(
        { length: data.rows },
        (_, row) => ({
          id: getSeatId(id, row, newCol),
          type: "seat",
          position: getSeatPosition(row, newCol),
          parentId: id,
          draggable: false,
          selectable: false,
          deletable: false,
          data: { row, col: newCol },
        })
      )
      return [...withTableDims(nds, id, data.rows, data.cols + 1), ...newSeats]
    })
  }

  function removeColumn() {
    const removedCol = data.cols - 1
    setNodes((nds) => {
      const removedSeatIds = new Set(
        nds
          .filter(
            (n) =>
              n.type === "seat" &&
              n.parentId === id &&
              n.data.col === removedCol
          )
          .map((n) => n.id)
      )
      return withTableDims(nds, id, data.rows, data.cols - 1).filter((n) => {
        if (n.type === "seat" && removedSeatIds.has(n.id)) return false
        if (
          n.type === "student" &&
          n.parentId &&
          removedSeatIds.has(n.parentId)
        )
          return false
        return true
      })
    })
  }

  function handleRemoveColumn() {
    if (data.cols <= 1) return
    const removedSeatIds = new Set(
      getNodes()
        .filter(
          (n) =>
            n.type === "seat" &&
            n.parentId === id &&
            n.data.col === data.cols - 1
        )
        .map((n) => n.id)
    )
    if (seatsOccupied(removedSeatIds)) {
      setPendingAction("col")
      return
    }
    removeColumn()
  }

  function confirmPendingAction() {
    if (pendingAction === "table") removeTable()
    else if (pendingAction === "row") removeRow()
    else if (pendingAction === "col") removeColumn()
    setPendingAction(null)
  }

  const { width, height } = getTableNodeSize(data.rows, data.cols)

  return (
    <div>
      <BaseNode style={{ width, height }}>
        <BaseNodeContent>
          <div className="absolute -top-5 left-0 flex items-center text-xs">
            <GripVerticalIcon size={11} />
            <span>Table {data.table_number + 1}</span>
          </div>
        </BaseNodeContent>
      </BaseNode>
      <NodeToolbar
        position={Position.Bottom}
        className="nodrag flex items-center gap-1 rounded-md border bg-card p-1 text-xs shadow-md"
      >
        <div className="flex items-center gap-0.5 rounded-md border p-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Remove row"
            disabled={data.rows <= 1}
            onClick={handleRemoveRow}
          >
            <MinusIcon />
          </Button>
          <span className="px-1">Rows</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Add row"
            disabled={data.rows >= MAX_TABLE_DIMENSION}
            onClick={handleAddRow}
          >
            <PlusIcon />
          </Button>
        </div>
        <div className="flex items-center gap-0.5 rounded-md border p-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Remove column"
            disabled={data.cols <= 1}
            onClick={handleRemoveColumn}
          >
            <MinusIcon />
          </Button>
          <span className="px-1">Cols</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Add column"
            disabled={data.cols >= MAX_TABLE_DIMENSION}
            onClick={handleAddColumn}
          >
            <PlusIcon />
          </Button>
        </div>
        <Button
          type="button"
          variant="destructive"
          size="xs"
          onClick={() => setPendingAction("table")}
        >
          <Trash2Icon data-icon="inline-start" />
          <span>Delete</span>
        </Button>
      </NodeToolbar>
      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(open) => !open && setPendingAction(null)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {pendingAction === "table"
                ? `Delete Table ${data.table_number + 1}?`
                : pendingAction === "row"
                  ? "Remove this row?"
                  : "Remove this column?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction === "table"
                ? "This removes the table and all of its seats, unassigning any seated students."
                : "This will unassign any students currently seated in it."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline">Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmPendingAction}
            >
              {pendingAction === "table" ? "Delete" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
})
