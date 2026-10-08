import { describe, expect, it } from "vitest"
import { centsOf, formatCents, fromCents } from "@/lib/rates"

describe("rates", () => {
  it("reads typed money as minor units", () => {
    expect(centsOf("85")).toBe(8500)
    expect(centsOf(" 85.5 ")).toBe(8550)
    expect(centsOf("1,200.50")).toBe(120050)
    // A decimal comma, as in most of Europe: never read as thousands.
    expect(centsOf("85,50")).toBe(8550)
    expect(centsOf("0,99")).toBe(99)
    expect(centsOf("1,000")).toBe(100000)
    expect(centsOf("1,2345")).toBeNull()
    expect(centsOf("0")).toBe(0)
    for (const bad of ["", "-5", "85.555", "abc", "1e3", "1000001"]) expect(centsOf(bad)).toBeNull()
  })
  it("writes minor units back for the form", () => {
    expect(fromCents(8500)).toBe("85")
    expect(fromCents(8550)).toBe("85.50")
  })
  it("formats money in the currency", () => expect(formatCents(15000, "USD")).toMatch(/\$150\.00/))
})
