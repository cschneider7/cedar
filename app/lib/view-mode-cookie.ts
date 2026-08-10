export type StudentViewMode = "grid" | "list"

export const VIEW_MODE_COOKIE_NAME = "students-view-mode"

/** Reads the stored view-mode preference out of a `Cookie` header value —
 * the same `key1=val1; key2=val2` format used by both an HTTP request's
 * `Cookie` header (server-side, in a loader) and `document.cookie`
 * (client-side), so this one parser serves both call sites. Lets the
 * loader render the right layout on the very first paint instead of
 * always defaulting to grid and swapping to list after hydration. */
export function parseViewModeCookie(
  cookieHeader: string | null | undefined
): StudentViewMode {
  if (!cookieHeader) {
    return "grid"
  }
  const match = cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${VIEW_MODE_COOKIE_NAME}=`))
  return match?.slice(VIEW_MODE_COOKIE_NAME.length + 1) === "list"
    ? "list"
    : "grid"
}

export function serializeViewModeCookie(mode: StudentViewMode): string {
  return `${VIEW_MODE_COOKIE_NAME}=${mode}; Path=/; Max-Age=31536000; SameSite=Lax`
}
