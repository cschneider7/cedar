import { useState } from "react"
import {
  parseViewModeCookie,
  serializeViewModeCookie,
  type StudentViewMode,
} from "~/lib/view-mode-cookie"

export type { StudentViewMode }

/**
 * Reads/writes the student list's grid-vs-list view preference, persisted
 * as a cookie so the SSR loader can render the right layout on first paint.
 * @returns A `[viewMode, setViewMode]` pair.
 */
export function useStudentViewMode() {
  const [viewMode, setViewModeState] = useState<StudentViewMode>(() => {
    if (typeof document === "undefined") {
      return "grid"
    }
    return parseViewModeCookie(document.cookie)
  })

  function setViewMode(mode: StudentViewMode) {
    document.cookie = serializeViewModeCookie(mode)
    setViewModeState(mode)
  }

  return [viewMode, setViewMode] as const
}
