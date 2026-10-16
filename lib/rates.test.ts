import { describe, expect, it } from "vitest"
import { centsOf, formatCents, fromCents } from "@/lib/rates"

describe("rates", () => {
  // Read as every typed number is (lib/format/number), in the reader's locale.
  it("reads typed money as minor units, as the reader writes numbers", () => {
    expect(centsOf("85", "en-US")).toBe(8500)
    expect(centsOf(" 85.5 ", "en-US")).toBe(8550)
    expect(centsOf("1,200.50", "en-US")).toBe(120050)
    expect(centsOf("1,000", "en-US")).toBe(100000)
    expect(centsOf("$85", "en-US")).toBe(8500)
    expect(centsOf("1,00,000", "en-IN")).toBe(10000000)
    // A decimal comma, as in most of Europe: never read as thousands.
    expect(centsOf("85,50", "de-DE")).toBe(8550)
    expect(centsOf("0,99", "de-DE")).toBe(99)
    expect(centsOf("1.200,50 €", "de-DE")).toBe(120050)
    // What reads two ways is refused, not guessed.
    expect(centsOf("85,50", "en-US")).toBeNull()
    expect(centsOf("85.50", "de-DE")).toBeNull()
    expect(centsOf("1,2345", "en-US")).toBeNull()
    expect(centsOf("0", "en-US")).toBe(0)
    for (const bad of ["", "-5", "85.555", "abc", "1e3", "1000001"]) expect(centsOf(bad, "en-US")).toBeNull()
  })
  it("writes minor units back for the form, in the reader's decimal sign, so they read again", () => {
    expect(fromCents(8500, "en-US")).toBe("85")
    expect(fromCents(8550, "en-US")).toBe("85.50")
    expect(fromCents(8550, "de-DE")).toBe("85,50")
    for (const locale of ["en-US", "en-IN", "de-DE", "fr-FR"]) for (const cents of [0, 99, 8550, 120050]) expect([locale, centsOf(fromCents(cents, locale), locale)]).toEqual([locale, cents])
  })
  it("formats money in the currency", () => expect(formatCents(15000, "USD")).toMatch(/\$150\.00/))
})
