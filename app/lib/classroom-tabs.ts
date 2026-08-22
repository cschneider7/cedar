export type ClassroomTab = "overview" | "roster" | "seating-chart" | "cold-call"

const CLASSROOM_TABS: readonly ClassroomTab[] = [
  "overview",
  "roster",
  "seating-chart",
  "cold-call",
]

/**
 * Narrows a classroom route's path segment to a known classroom tab.
 * @param value - The raw path segment.
 * @returns Whether `value` is a recognized `ClassroomTab`.
 */
export function isClassroomTab(value: string | null): value is ClassroomTab {
  return value !== null && (CLASSROOM_TABS as readonly string[]).includes(value)
}

/**
 * Maps a classroom route's current pathname to its active tab.
 * @param pathname - The current location pathname.
 * @param classroomId - The classroom's id, to strip its route prefix.
 * @returns The matching tab, or `"overview"` for the bare classroom path or
 * an unrecognized segment.
 */
export function classroomTabFromPathname(
  pathname: string,
  classroomId: string
): ClassroomTab {
  const prefix = `/classrooms/${classroomId}`
  const rest = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : ""
  const segment = rest.replace(/^\/|\/$/g, "")
  return isClassroomTab(segment) ? segment : "overview"
}
