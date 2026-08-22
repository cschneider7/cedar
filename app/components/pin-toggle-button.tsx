import { Pin, PinOff } from "lucide-react"
import { Button } from "~/components/ui/button"
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
  const action = isPinned ? "Unpin from Sidebar" : "Pin to Sidebar"

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${action} ${label ?? "classroom"}`}
            disabled={isPending}
            onClick={() => setPinned(classroom.id, !isPinned, pinnedCount)}
          >
            {isPinned ? <PinOff /> : <Pin />}
          </Button>
        }
      />
      <TooltipContent>{action}</TooltipContent>
    </Tooltip>
  )
}
