import { describe, expect, it } from "vitest"
import { isAtStudentLimit } from "./student-limit"

describe("isAtStudentLimit", () => {
  it("returns false when under the limit", () => {
    expect(isAtStudentLimit(849, 850)).toBe(false)
  })

  it("returns true when exactly at the limit", () => {
    expect(isAtStudentLimit(850, 850)).toBe(true)
  })

  it("returns true when over the limit", () => {
    expect(isAtStudentLimit(851, 850)).toBe(true)
  })

  it("fails open (false) when the count is unavailable", () => {
    expect(isAtStudentLimit(null, 850)).toBe(false)
  })

  it("fails open (false) when the limit is unavailable", () => {
    expect(isAtStudentLimit(850, null)).toBe(false)
  })
})
