import { StudentAvatar } from "~/components/student-avatar"
import { ItemContent, ItemHeader, ItemTitle } from "~/components/ui/item"
import type { Student } from "~/lib/schemas"

/** Renders a student's avatar and name as shared card content. */
export function StudentCardContent({ student }: { student: Student }) {
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
