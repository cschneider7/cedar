import { describe, expect, it } from "vitest"
import {
  parseViewModeCookie,
  serializeViewModeCookie,
} from "~/lib/view-mode-cookie"

describe("parseViewModeCookie", () => {
  it("defaults to grid when there's no cookie header", () => {
    expect(parseViewModeCookie(null)).toBe("grid")
    expect(parseViewModeCookie(undefined)).toBe("grid")
    expect(parseViewModeCookie("")).toBe("grid")
  })

  it("defaults to grid when the cookie is missing or not 'list'", () => {
    expect(parseViewModeCookie("other=1")).toBe("grid")
    expect(parseViewModeCookie("students-view-mode=grid")).toBe("grid")
    expect(parseViewModeCookie("students-view-mode=bogus")).toBe("grid")
  })

  it("reads 'list' out of a single cookie", () => {
    expect(parseViewModeCookie("students-view-mode=list")).toBe("list")
  })

  it("reads 'list' out of a multi-cookie header", () => {
    expect(
      parseViewModeCookie("theme=dark; students-view-mode=list; other=1")
    ).toBe("list")
  })
})

describe("serializeViewModeCookie", () => {
  it("round-trips through parseViewModeCookie", () => {
    expect(parseViewModeCookie(serializeViewModeCookie("list"))).toBe("list")
    expect(parseViewModeCookie(serializeViewModeCookie("grid"))).toBe("grid")
  })
})
