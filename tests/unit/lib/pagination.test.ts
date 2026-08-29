import { describe, expect, it } from "vitest"
import { getPageNumbers } from "~/lib/pagination"

describe("getPageNumbers", () => {
  it("returns just page 1 when there's only one page", () => {
    expect(getPageNumbers(1, 1)).toEqual([1])
  })

  it("returns every page with no ellipsis when the total is small", () => {
    expect(getPageNumbers(1, 3)).toEqual([1, 2, 3])
    expect(getPageNumbers(2, 4)).toEqual([1, 2, 3, 4])
  })

  it("collapses pages after the current page near the start", () => {
    expect(getPageNumbers(1, 10)).toEqual([1, 2, "ellipsis", 10])
  })

  it("collapses pages on both sides when current is in the middle", () => {
    expect(getPageNumbers(5, 10)).toEqual([
      1,
      "ellipsis",
      4,
      5,
      6,
      "ellipsis",
      10,
    ])
  })

  it("collapses pages before the current page near the end", () => {
    expect(getPageNumbers(10, 10)).toEqual([1, "ellipsis", 9, 10])
  })
})
