import { describe, expect, it } from "vitest"
import {
  MAX_RECENT_CLASSROOMS,
  parseRecentClassroomsCookie,
  serializeRecentClassroomsCookie,
} from "./recent-classrooms-cookie"

describe("parseRecentClassroomsCookie", () => {
  it("defaults to an empty list when there's no cookie header", () => {
    expect(parseRecentClassroomsCookie(null)).toEqual([])
    expect(parseRecentClassroomsCookie(undefined)).toEqual([])
    expect(parseRecentClassroomsCookie("")).toEqual([])
  })

  it("defaults to an empty list when the cookie is missing", () => {
    expect(parseRecentClassroomsCookie("other=1")).toEqual([])
  })

  it("defaults to an empty list when the cookie value is malformed", () => {
    expect(parseRecentClassroomsCookie("recent-classrooms=not-json")).toEqual(
      []
    )
    expect(
      parseRecentClassroomsCookie(
        `recent-classrooms=${encodeURIComponent(JSON.stringify({ a: 1 }))}`
      )
    ).toEqual([])
  })

  it("reads ids out of a single cookie", () => {
    const value = encodeURIComponent(JSON.stringify(["a", "b"]))
    expect(parseRecentClassroomsCookie(`recent-classrooms=${value}`)).toEqual([
      "a",
      "b",
    ])
  })

  it("reads ids out of a multi-cookie header", () => {
    const value = encodeURIComponent(JSON.stringify(["a", "b"]))
    expect(
      parseRecentClassroomsCookie(
        `theme=dark; recent-classrooms=${value}; other=1`
      )
    ).toEqual(["a", "b"])
  })

  it("drops non-string entries", () => {
    const value = encodeURIComponent(JSON.stringify(["a", 1, "b", null]))
    expect(parseRecentClassroomsCookie(`recent-classrooms=${value}`)).toEqual([
      "a",
      "b",
    ])
  })
})

describe("serializeRecentClassroomsCookie", () => {
  it("round-trips through parseRecentClassroomsCookie", () => {
    expect(
      parseRecentClassroomsCookie(serializeRecentClassroomsCookie(["a", "b"]))
    ).toEqual(["a", "b"])
    expect(parseRecentClassroomsCookie(serializeRecentClassroomsCookie([]))).toEqual(
      []
    )
  })

  it(`caps the serialized list at ${MAX_RECENT_CLASSROOMS} ids`, () => {
    const ids = Array.from({ length: MAX_RECENT_CLASSROOMS + 3 }, (_, i) =>
      String(i)
    )
    const roundTripped = parseRecentClassroomsCookie(
      serializeRecentClassroomsCookie(ids)
    )
    expect(roundTripped).toEqual(ids.slice(0, MAX_RECENT_CLASSROOMS))
  })
})
