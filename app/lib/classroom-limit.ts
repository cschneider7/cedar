import type { Classroom } from "~/lib/schemas"

export const MAX_CLASSROOMS_PER_USER = 50
export const MAX_PINNED_CLASSROOMS = 10

/**
 * Whether the account is at or over its classroom cap. Fails open (`false`)
 * when the count couldn't be loaded — the backend's own check is the real
 * enforcement point.
 * @param classroomCount - The account's current classroom count, or null if unavailable.
 * @param classroomLimit - The account's classroom cap, or null if unavailable.
 * @returns True if at or over the classroom limit.
 */
export function isAtClassroomLimit(
  classroomCount: number | null,
  classroomLimit: number | null
): boolean {
  if (classroomCount === null || classroomLimit === null) return false
  return classroomCount >= classroomLimit
}

/**
 * Whether the account is at or over its pinned-classroom cap. Fails open
 * (`false`) when the count couldn't be loaded — the backend's own check is
 * the real enforcement point.
 * @param pinnedCount - The account's current pinned classroom count, or null if unavailable.
 * @param pinLimit - The account's pinned classroom cap, or null if unavailable.
 * @returns True if at or over the pin limit.
 */
export function isAtPinLimit(
  pinnedCount: number | null,
  pinLimit: number | null
): boolean {
  if (pinnedCount === null || pinLimit === null) return false
  return pinnedCount >= pinLimit
}

/**
 * The account's pinned classrooms, most-recently-pinned first. The single
 * source of truth for "which classrooms count as pinned" — callers that
 * only need the count should use `.length` on the result.
 * @param classrooms - The account's full classroom list.
 * @returns Pinned classrooms sorted by `pinned_at` descending.
 */
export function getPinnedClassrooms(
  classrooms: Classroom[]
): (Classroom & { pinned_at: string })[] {
  return classrooms
    .filter((c): c is Classroom & { pinned_at: string } => c.pinned_at != null)
    .sort((a, b) => b.pinned_at.localeCompare(a.pinned_at))
}
