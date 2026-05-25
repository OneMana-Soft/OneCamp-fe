import { describe, expect, it } from "vitest"
import { getNameInitials } from "./getNameInitials"

// First passing test under the new vitest harness. Picked an
// unambiguous pure function so the test harness wiring is what's being
// validated, not behaviour. Real component tests can layer on top.
describe("getNameInitials", () => {
  it("returns empty string for null/undefined/empty input", () => {
    expect(getNameInitials(null)).toBe("")
    expect(getNameInitials(undefined)).toBe("")
    expect(getNameInitials("")).toBe("")
    expect(getNameInitials("   ")).toBe("")
  })

  it("returns single uppercase initial for a one-word name", () => {
    expect(getNameInitials("akash")).toBe("A")
    expect(getNameInitials("ALICE")).toBe("A")
  })

  it("returns first+last initials for multi-word names", () => {
    expect(getNameInitials("akash chandran")).toBe("AC")
    expect(getNameInitials("Mary Jane Watson")).toBe("MW")
  })

  it("collapses internal whitespace", () => {
    expect(getNameInitials("akash    chandran")).toBe("AC")
    expect(getNameInitials("\takash\nchandran")).toBe("AC")
  })
})
