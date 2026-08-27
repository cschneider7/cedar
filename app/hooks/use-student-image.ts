import { useEffect, useState } from "react"
import { getAccessTokenBrowser } from "~/lib/supabase/client"

const API_URL = import.meta.env.VITE_API_URL

/**
 * Fetches a student's private photo through the backend
 * @param studentId - The student whose photo to fetch.
 * @param enabled - Skip fetching (e.g. when the student has no photo set).
 * @returns The object URL once loaded, or `null` while loading/on failure.
 */
export function useStudentImage(
  studentId: string,
  enabled: boolean
): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setUrl(null)
      return
    }

    let objectUrl: string | null = null
    let cancelled = false
    ;(async () => {
      try {
        const token = await getAccessTokenBrowser()
        const res = await fetch(`${API_URL}/students/${studentId}/image`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (!res.ok || cancelled) return
        const blob = await res.blob()
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      } catch {
        // StudentAvatar falls back to an initials badge on a null url.
      }
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [studentId, enabled])

  return url
}
