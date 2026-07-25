import { ItemContent, ItemHeader, ItemTitle } from "~/components/ui/item"
import type { Student } from "~/lib/schemas"

/** Renders a student's avatar and name as shared card content. */
export function StudentCardContent({ student }: { student: Student }) {
  return (
    <>
      <ItemHeader>
        <img
          src={`https://avatar.vercel.sh/${student.id}`}
          alt="Student image"
          draggable="false"
          width={100}
          height={80}
          loading="lazy"
          className="aspect-5/4 w-full rounded-sm object-cover brightness-60 grayscale dark:brightness-40"
        />
      </ItemHeader>
      <ItemContent>
        <ItemTitle className="text-xs select-none">{student.name}</ItemTitle>
      </ItemContent>
    </>
  )
}
