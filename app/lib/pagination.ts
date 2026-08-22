/**
 * Builds an ellipsis-collapsed list of page numbers to render in a pagination
 * control, e.g. `[1, "ellipsis", 4, 5, 6, "ellipsis", 10]`.
 * @param current - The current 1-indexed page number.
 * @param total - The total number of pages.
 * @returns Page numbers and `"ellipsis"` markers, in display order.
 */
export function getPageNumbers(
  current: number,
  total: number
): (number | "ellipsis")[] {
  if (total <= 1) return [1]
  const delta = 1
  const range: number[] = []
  for (
    let i = Math.max(2, current - delta);
    i <= Math.min(total - 1, current + delta);
    i++
  ) {
    range.push(i)
  }

  const pages: (number | "ellipsis")[] = [1]
  if (range[0] > 2) pages.push("ellipsis")
  pages.push(...range)
  if (range.length > 0 && range[range.length - 1] < total - 1) {
    pages.push("ellipsis")
  } else if (range.length === 0 && total > 2) {
    pages.push("ellipsis")
  }
  pages.push(total)
  return pages
}
