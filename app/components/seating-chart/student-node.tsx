import { useReactFlow, type Node, type NodeProps } from "@xyflow/react"
import { Trash2Icon } from "lucide-react"
import { memo, useContext } from "react"
import { StudentAvatar } from "~/components/student-avatar"
import { Button } from "~/components/ui/button"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemHeader,
  ItemTitle,
} from "~/components/ui/item"
import {
  STUDENT_NODE_SIZE,
  type SeatingChartNode,
  type StudentNodeData,
} from "~/lib/seating-chart-utils"
import { BaseNode } from "../base-node"
import { LockedContext } from "./context"

/** Renders a student as a draggable React Flow node, seated or floating. */
export const StudentNode = memo(function StudentNode({
  id,
  data,
  selected,
}: NodeProps<Node<StudentNodeData, "student">>) {
  const locked = useContext(LockedContext)
  const { setNodes } = useReactFlow<SeatingChartNode>()

  const showSelectedUi = !!selected && !locked

  function handleDelete() {
    setNodes((nds) => nds.filter((n) => n.id !== id))
  }

  return (
    <BaseNode
      style={{ width: STUDENT_NODE_SIZE, height: STUDENT_NODE_SIZE }}
      className="cursor-grab touch-none select-none active:cursor-grabbing"
    >
      <Item
        size="xs"
        className="relative size-full gap-1 overflow-hidden p-1 **:data-[slot=item-title]:text-[10px]"
      >
        <ItemHeader className="relative">
          <StudentAvatar
            student={data.student}
            className="aspect-5/4 w-full rounded-sm"
          />
        </ItemHeader>
        <ItemContent>
          <ItemTitle className="text-xs select-none">
            {data.student.name}
          </ItemTitle>
        </ItemContent>
        {showSelectedUi ? (
          <ItemActions>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove ${data.student.name} from seat`}
              className="absolute right-0 -bottom-0.5"
              onClick={handleDelete}
            >
              <Trash2Icon />
            </Button>
          </ItemActions>
        ) : null}
      </Item>
    </BaseNode>
  )
})
