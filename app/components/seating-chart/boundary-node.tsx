import type { Node, NodeProps } from "@xyflow/react"
import { memo } from "react"
import { BaseNode } from "~/components/base-node"
import type { BoundaryNodeData } from "~/lib/seating-chart-utils"

/** Renders the seating chart's boundary rectangle as a React Flow node. */
export const BoundaryNode = memo(function BoundaryNode({
  data,
}: NodeProps<Node<BoundaryNodeData, "boundary">>) {
  return (
    <BaseNode
      className="border-4 border-solid border-muted-foreground/50 bg-transparent hover:ring-0"
      style={{ width: data.width, height: data.height }}
      tabIndex={-1}
    />
  )
})
