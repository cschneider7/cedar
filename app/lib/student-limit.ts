/**
 * Whether the account is at or over its student cap. Fails open (`false`)
 * when the count couldn't be loaded — the backend's own check is the real
 * enforcement point.
 * @param studentCount - The account's current student count, or null if unavailable.
 * @param studentLimit - The account's student cap, or null if unavailable.
 * @returns True if at or over the student limit.
 */
export function isAtStudentLimit(
  studentCount: number | null,
  studentLimit: number | null
): boolean {
  if (studentCount === null || studentLimit === null) return false
  return studentCount >= studentLimit
}
