import { useDraggable } from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { StudentAvatar } from "~/components/student-avatar"
import { Empty, EmptyDescription } from "~/components/ui/empty"
import { Item, ItemContent, ItemHeader, ItemTitle } from "~/components/ui/item"
import { ScrollArea } from "~/components/ui/scroll-area"
import { cn } from "~/lib/utils"
import type { Student } from "~/lib/schemas"

/** Shared avatar/name markup for a student chip, live or in the drag overlay. */
function StudentChipCard({ student }: { student: Student }) {
  return (
    <>
      <ItemHeader>
        <StudentAvatar
          student={student}
          className="aspect-5/4 w-full rounded-sm"
        />
      </ItemHeader>
      <ItemContent>
        <ItemTitle className="text-xs select-none">{student.name}</ItemTitle>
      </ItemContent>
    </>
  )
}

/** Renders a single unassigned student as a card draggable onto the canvas. */
function StudentChip({
  student,
  locked,
}: {
  student: Student
  locked: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: student.id, disabled: locked })

  return (
    <Item
      ref={setNodeRef}
      variant="outline"
      size="xs"
      style={
        transform ? { transform: CSS.Translate.toString(transform) } : undefined
      }
      className={cn(
        "aspect-square w-24 shrink-0 touch-manipulation overflow-hidden select-none",
        !locked && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-30"
      )}
      {...attributes}
      {...listeners}
    >
      <StudentChipCard student={student} />
    </Item>
  )
}

/** Visual-only copy of a chip, rendered inside DndContext's DragOverlay (portaled
 * to document.body) so it isn't clipped by the roster's ScrollArea overflow. */
export function StudentChipOverlay({ student }: { student: Student }) {
  return (
    <Item
      variant="outline"
      size="xs"
      className="aspect-square w-24 shrink-0 cursor-grabbing overflow-hidden shadow-lg"
    >
      <StudentChipCard student={student} />
    </Item>
  )
}

/** Scrollable panel listing every student not currently placed on the canvas. */
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
        <div className="h-full min-h-0 w-full shrink-0 p-3 transition-shadow md:w-35">
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
