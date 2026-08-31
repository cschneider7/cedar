export type StudentViewMode = "grid" | "list"

export const VIEW_MODE_COOKIE_NAME = "students-view-mode"

/**
 * Reads the stored view-mode preference out of a `Cookie` header value —
 * the same format works for both a request's `Cookie` header and `document.cookie`.
 * @param cookieHeader - The raw `Cookie` header (or `document.cookie`) value.
 * @returns The stored view mode, defaulting to `"list"` if unset.
 */
export function parseViewModeCookie(
  cookieHeader: string | null | undefined
): StudentViewMode {
  if (!cookieHeader) {
    return "list"
  }
  const match = cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${VIEW_MODE_COOKIE_NAME}=`))
  return match?.slice(VIEW_MODE_COOKIE_NAME.length + 1) === "grid"
    ? "grid"
    : "list"
}

/**
 * Serializes a view-mode preference into a `Set-Cookie`-ready string.
 * @param mode - The view mode to store.
 * @returns The full `Set-Cookie` header value.
 */
export function serializeViewModeCookie(mode: StudentViewMode): string {
  return `${VIEW_MODE_COOKIE_NAME}=${mode}; Path=/; Max-Age=31536000; SameSite=Lax`
}
