import { useState } from "react"

export type StudentViewMode = "grid" | "list"

const STORAGE_KEY = "students-view-mode"

export function useStudentViewMode() {
  const [viewMode, setViewModeState] = useState<StudentViewMode>(() => {
    if (typeof window === "undefined") {
      return "grid"
    }
    return localStorage.getItem(STORAGE_KEY) === "list" ? "list" : "grid"
  })

  function setViewMode(mode: StudentViewMode) {
    localStorage.setItem(STORAGE_KEY, mode)
    setViewModeState(mode)
  }

  return [viewMode, setViewMode] as const
}
