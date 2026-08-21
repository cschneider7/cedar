import { describe, expect, it } from "vitest"
import { isClassroomTab } from "./classroom-tabs"

describe("isClassroomTab", () => {
  it("accepts every known tab value", () => {
    expect(isClassroomTab("overview")).toBe(true)
    expect(isClassroomTab("roster")).toBe(true)
    expect(isClassroomTab("seating-chart")).toBe(true)
    expect(isClassroomTab("cold-call")).toBe(true)
  })

  it("rejects an unrecognized value", () => {
    expect(isClassroomTab("bogus")).toBe(false)
  })

  it("rejects a missing param", () => {
    expect(isClassroomTab(null)).toBe(false)
  })
})
