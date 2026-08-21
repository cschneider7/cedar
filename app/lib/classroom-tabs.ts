export type ClassroomTab = "overview" | "roster" | "seating-chart" | "cold-call"

const CLASSROOM_TABS: readonly ClassroomTab[] = [
  "overview",
  "roster",
  "seating-chart",
  "cold-call",
]

/**
 * Narrows a `?tab=` search param value to a known classroom tab.
 * @param value - The raw `tab` search param value.
 * @returns Whether `value` is a recognized `ClassroomTab`.
 */
export function isClassroomTab(value: string | null): value is ClassroomTab {
  return value !== null && (CLASSROOM_TABS as readonly string[]).includes(value)
}
