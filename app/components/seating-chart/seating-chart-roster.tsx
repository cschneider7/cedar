import { StudentAvatar } from "~/components/student-avatar"
import { Empty, EmptyDescription } from "~/components/ui/empty"
import { Item, ItemContent, ItemHeader, ItemTitle } from "~/components/ui/item"
import { ScrollArea } from "~/components/ui/scroll-area"
import type { Student } from "~/lib/schemas"

export const STUDENT_DATA_TRANSFER_TYPE = "application/x-student-id"

/** Renders a single unassigned student as a card draggable onto the canvas. */
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
      <ItemHeader>
        <StudentAvatar
          student={student}
          className="aspect-5/4 w-full rounded-sm"
        />
      </ItemHeader>
      <ItemContent>
        <ItemTitle className="text-xs select-none">{student.name}</ItemTitle>
      </ItemContent>
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
