import type { Node, NodeProps } from "@xyflow/react"
import { memo } from "react"
import { BaseNode } from "~/components/base-node"

export type BoundaryNodeData = {
  width: number
  height: number
}

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
