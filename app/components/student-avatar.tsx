import { useState } from "react"
import { useStudentImage } from "~/hooks/use-student-image"
import { cn } from "~/lib/utils"
import type { Student } from "~/lib/schemas"

const AVATAR_PALETTE = [
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-lime-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-blue-500",
  "bg-violet-500",
  "bg-fuchsia-500",
  "bg-pink-500",
]

/**
 * Deterministically maps a string id to an index in `[0, length)`.
 * @param id - The string to hash.
 * @param length - The exclusive upper bound of the returned index.
 * @returns An index in `[0, length)`.
 */
function hashToIndex(id: string, length: number): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % length
}

/**
 * Extracts up to two uppercase initials from a name.
 * @param name - The full name to abbreviate.
 * @returns Up to two uppercase initials.
 */
function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("")
}

/**
 * Renders a student's uploaded photo, or a deterministic initials badge
 * when no photo is set or the photo fails to load (e.g. a stale `image_url`
 * left over from a database branch/environment whose object storage doesn't
 * have the underlying file).
 */
export function StudentAvatar({
  student,
  className,
}: {
  student: Pick<Student, "id" | "name" | "image_url">
  className?: string
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const hasPhoto = Boolean(student.image_url) && !imageFailed
  const objectUrl = useStudentImage(student.id, hasPhoto)

  if (hasPhoto && objectUrl) {
    return (
      <img
        src={objectUrl}
        alt=""
        draggable="false"
        loading="lazy"
        className={cn("object-cover", className)}
        onError={() => setImageFailed(true)}
      />
    )
  }

  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex items-center justify-center font-medium text-white select-none",
        AVATAR_PALETTE[hashToIndex(student.id, AVATAR_PALETTE.length)],
        className
      )}
    >
      {getInitials(student.name)}
    </div>
  )
}
