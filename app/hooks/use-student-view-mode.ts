import { useState } from "react"
import {
  parseViewModeCookie,
  serializeViewModeCookie,
  type StudentViewMode,
} from "~/lib/view-mode-cookie"

export type { StudentViewMode }

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
