export const RECENT_CLASSROOMS_COOKIE_NAME = "recent-classrooms"
export const MAX_RECENT_CLASSROOMS = 5

/**
 * Parses a list of ids out of a cookie header.
 * @param cookieHeader - The raw `Cookie` header value, or `document.cookie`.
 * @returns The parsed ids, or an empty array if missing/malformed.
 */
export function parseRecentClassroomsCookie(
  cookieHeader: string | null | undefined
): string[] {
  if (!cookieHeader) return []
  const match = cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${RECENT_CLASSROOMS_COOKIE_NAME}=`))
  if (!match) return []
  try {
    const parsed = JSON.parse(
      decodeURIComponent(match.slice(RECENT_CLASSROOMS_COOKIE_NAME.length + 1))
    )
    return Array.isArray(parsed)
      ? parsed.filter((id) => typeof id === "string")
      : []
  } catch {
    return []
  }
}

/**
 * Serializes a list of ids into a cookie header value, capped to the max.
 * @param ids - The ids to persist, most-recent-first.
 * @returns The `Set-Cookie`-ready string.
 */
export function serializeRecentClassroomsCookie(ids: string[]): string {
  const value = encodeURIComponent(
    JSON.stringify(ids.slice(0, MAX_RECENT_CLASSROOMS))
  )
  return `${RECENT_CLASSROOMS_COOKIE_NAME}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`
}
