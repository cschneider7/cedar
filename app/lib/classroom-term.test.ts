import { describe, expect, it } from "vitest"
import { formatClassroomName, formatTermAbbreviation } from "./classroom-term"

describe("formatTermAbbreviation", () => {
  it("abbreviates fall", () => {
    expect(formatTermAbbreviation("fall", 2026)).toBe("FA26")
  })

  it("abbreviates winter", () => {
    expect(formatTermAbbreviation("winter", 2026)).toBe("WI26")
  })

  it("abbreviates spring", () => {
    expect(formatTermAbbreviation("spring", 2027)).toBe("SP27")
  })

  it("abbreviates summer", () => {
    expect(formatTermAbbreviation("summer", 2027)).toBe("SU27")
  })

  it("truncates the year to its last 2 digits", () => {
    expect(formatTermAbbreviation("fall", 2031)).toBe("FA31")
  })
})

describe("formatClassroomName", () => {
  it("composes the term, subject, and period into one string", () => {
    expect(
      formatClassroomName({
        subject: "Math 2",
        period: 3,
        term_season: "fall",
        term_year: 2026,
      })
    ).toBe("[FA26] Math 2 (Per 3)")
  })
})
