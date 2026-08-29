import { describe, expect, it } from "vitest"
import { classroomTabFromPathname, isClassroomTab } from "~/lib/classroom-tabs"

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

describe("classroomTabFromPathname", () => {
  const classroomId = "classroom-1"

  it("defaults to overview for the bare classroom path", () => {
    expect(
      classroomTabFromPathname(`/classrooms/${classroomId}`, classroomId)
    ).toBe("overview")
  })

  it("defaults to overview for the bare classroom path with a trailing slash", () => {
    expect(
      classroomTabFromPathname(`/classrooms/${classroomId}/`, classroomId)
    ).toBe("overview")
  })

  it("recognizes each known tab segment", () => {
    expect(
      classroomTabFromPathname(`/classrooms/${classroomId}/roster`, classroomId)
    ).toBe("roster")
    expect(
      classroomTabFromPathname(
        `/classrooms/${classroomId}/seating-chart`,
        classroomId
      )
    ).toBe("seating-chart")
    expect(
      classroomTabFromPathname(
        `/classrooms/${classroomId}/cold-call`,
        classroomId
      )
    ).toBe("cold-call")
  })

  it("defaults to overview for an unrecognized segment", () => {
    expect(
      classroomTabFromPathname(`/classrooms/${classroomId}/bogus`, classroomId)
    ).toBe("overview")
  })

  it("defaults to overview when the pathname doesn't match this classroom", () => {
    expect(
      classroomTabFromPathname(`/classrooms/other-id/roster`, classroomId)
    ).toBe("overview")
  })
})
