import { describe, expect, it } from "vitest"
import {
  parseViewModeCookie,
  serializeViewModeCookie,
} from "~/lib/view-mode-cookie"

describe("parseViewModeCookie", () => {
  it("defaults to list when there's no cookie header", () => {
    expect(parseViewModeCookie(null)).toBe("list")
    expect(parseViewModeCookie(undefined)).toBe("list")
    expect(parseViewModeCookie("")).toBe("list")
  })

  it("defaults to list when the cookie is missing or not 'grid'", () => {
    expect(parseViewModeCookie("other=1")).toBe("list")
    expect(parseViewModeCookie("students-view-mode=list")).toBe("list")
    expect(parseViewModeCookie("students-view-mode=bogus")).toBe("list")
  })

  it("reads 'grid' out of a single cookie", () => {
    expect(parseViewModeCookie("students-view-mode=grid")).toBe("grid")
  })

  it("reads 'grid' out of a multi-cookie header", () => {
    expect(
      parseViewModeCookie("theme=dark; students-view-mode=grid; other=1")
    ).toBe("grid")
  })
})

describe("serializeViewModeCookie", () => {
  it("round-trips through parseViewModeCookie", () => {
    expect(parseViewModeCookie(serializeViewModeCookie("list"))).toBe("list")
    expect(parseViewModeCookie(serializeViewModeCookie("grid"))).toBe("grid")
  })
})
