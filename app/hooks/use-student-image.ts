import { useEffect, useState } from "react"
import { getBearerToken } from "~/lib/auth-client"

const API_URL = import.meta.env.VITE_API_URL

/**
 * Fetches a student's private photo through the Rust backend's
 * authenticated proxy and exposes it as an object URL for an `<img src>`.
 * Replaces the old same-origin Node proxy — Neon Auth's session cookie
 * isn't sent to this app's own origin, and a bare `<img src>` can't carry
 * an `Authorization` header, so the photo is fetched with `fetch()` +
 * Bearer auth instead and rendered via an object URL.
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
        const token = await getBearerToken()
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
