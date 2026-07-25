import type { Node, NodeProps } from "@xyflow/react"
import { memo } from "react"
import { BaseNode } from "~/components/base-node"
import { SEAT_NODE_SIZE, type SeatNodeData } from "~/lib/seating-chart-utils"

/** Renders an empty seat slot as a React Flow node, parented to its table. */
export const SeatNode = memo(function SeatNode({}: NodeProps<
  Node<SeatNodeData, "seat">
>) {
  return (
    <BaseNode
      className="pointer-events-none border-dashed bg-muted/40 hover:ring-0"
      style={{ width: SEAT_NODE_SIZE, height: SEAT_NODE_SIZE }}
      tabIndex={-1}
    />
  )
})
