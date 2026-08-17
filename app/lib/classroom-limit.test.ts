import { describe, expect, it } from "vitest"
import { isAtClassroomLimit, isAtPinLimit } from "./classroom-limit"

describe("isAtClassroomLimit", () => {
  it("returns false when under the limit", () => {
    expect(isAtClassroomLimit(49, 50)).toBe(false)
  })

  it("returns true when exactly at the limit", () => {
    expect(isAtClassroomLimit(50, 50)).toBe(true)
  })

  it("returns true when over the limit", () => {
    expect(isAtClassroomLimit(51, 50)).toBe(true)
  })

  it("fails open (false) when the count is unavailable", () => {
    expect(isAtClassroomLimit(null, 50)).toBe(false)
  })

  it("fails open (false) when the limit is unavailable", () => {
    expect(isAtClassroomLimit(50, null)).toBe(false)
  })
})

describe("isAtPinLimit", () => {
  it("returns false when under the limit", () => {
    expect(isAtPinLimit(9, 10)).toBe(false)
  })

  it("returns true when exactly at the limit", () => {
    expect(isAtPinLimit(10, 10)).toBe(true)
  })

  it("returns true when over the limit", () => {
    expect(isAtPinLimit(11, 10)).toBe(true)
  })

  it("fails open (false) when the count is unavailable", () => {
    expect(isAtPinLimit(null, 10)).toBe(false)
  })

  it("fails open (false) when the limit is unavailable", () => {
    expect(isAtPinLimit(10, null)).toBe(false)
  })
})
