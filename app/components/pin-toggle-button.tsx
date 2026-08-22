import { Bookmark } from "lucide-react"
import { Toggle } from "~/components/ui/toggle"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import { usePinClassroom } from "~/hooks/use-pin-classroom"
import type { Classroom } from "~/lib/schemas"

/**
 * Icon-only pin/unpin toggle with a tooltip, shared by the classroom list
 * table and the classroom detail page header.
 */
export function PinToggleButton({
  classroom,
  pinnedCount,
  label,
}: {
  classroom: Classroom
  pinnedCount: number
  /** Appended to "Pin"/"Unpin" for the aria-label, e.g. the classroom's subject. */
  label?: string
}) {
  const { setPinned, isPending } = usePinClassroom()
  const isPinned = classroom.pinned_at != null
  const action = isPinned ? "Remove from Sidebar" : "Add to Sidebar"

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle
            size="sm"
            className="aria-pressed:bg-transparent"
            aria-label={`${action} ${label ?? "classroom"}`}
            disabled={isPending}
            pressed={isPinned}
            onPressedChange={(pressed) =>
              setPinned(classroom.id, pressed, pinnedCount)
            }
          >
            <Bookmark fill={isPinned ? "currentColor" : "none"} />
          </Toggle>
        }
      />
      <TooltipContent>{action}</TooltipContent>
    </Tooltip>
  )
}
