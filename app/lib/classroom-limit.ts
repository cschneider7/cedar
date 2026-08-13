export const MAX_CLASSROOMS_PER_USER = 50

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
