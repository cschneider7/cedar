import { useEffect, useState } from "react"
import {
  MAX_RECENT_CLASSROOMS,
  parseRecentClassroomsCookie,
  serializeRecentClassroomsCookie,
} from "~/lib/recent-classrooms-cookie"

/**
 * Reads/writes a most-recent-first list of visited classroom ids.
 * @returns A `[recentIds, addRecent]` pair.
 */
export function useRecentClassrooms() {
  // Starts empty (matching SSR, which has no cookie access) to avoid a
  // hydration mismatch — the real value is synced in below, once mounted.
  const [recentIds, setRecentIds] = useState<string[]>([])

  useEffect(() => {
    setRecentIds(parseRecentClassroomsCookie(document.cookie))
  }, [])

  function addRecent(id: string) {
    setRecentIds((prev) => {
      const next = [id, ...prev.filter((existing) => existing !== id)].slice(
        0,
        MAX_RECENT_CLASSROOMS
      )
      document.cookie = serializeRecentClassroomsCookie(next)
      return next
    })
  }

  return [recentIds, addRecent] as const
}
