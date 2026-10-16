import { describe, expect, it } from "vitest"
import { numberSigns, parseTypedNumber, plainNumberOf, typedNumber, typedNumberText } from "@/lib/format/number"

// TAB-BUG-8: a number cell deleted commas, spaces, ₹ and $ and called
// Number(): "1,5" was saved as 15, "1.234,56" as 1.23456, and "€12", "12 kg"
// or "TBD" as nothing, wiping the cell. Typing is read in the reader's
// locale now, and what isn't a number is refused (null).
describe("a number typed into a cell", () => {
  it.each([
    ["de-DE", { "1,5": 1.5, "1.234,56": 1234.56, "€12": 12, "12 €": 12, "12 kg": null }],
    ["fr-FR", { "1,5": 1.5, "1.234,56": 1234.56, "1 234,56": 1234.56, "1 234,56": 1234.56, "€12": 12, "12 kg": null }],
    ["en-IN", { "1,5": null, "1.234,56": null, "€12": 12, "₹1,00,000": 100000, "12 kg": null }],
    ["en-US", { "1,5": null, "1.234,56": null, "€12": 12, "-$1,200.50": -1200.5, "12 kg": null }],
  ] as const)("is read in %s", (locale, cases) => {
    for (const [typed, want] of Object.entries(cases)) expect([typed, parseTypedNumber(typed, locale)]).toEqual([typed, want])
  })

  it("refuses what isn't a number, wherever it's typed", () => {
    for (const typed of ["TBD", "n/a", "0x10", "Infinity", "12 kg", "€", "-", "€€1", "1..2"]) expect([typed, parseTypedNumber(typed, "en-US")]).toEqual([typed, null])
  })

  it("is blank when nothing is typed, and takes a true minus", () => {
    expect(parseTypedNumber("  ", "de-DE")).toBe("")
    expect(parseTypedNumber("−120", "en-US")).toBe(-120)
    expect(parseTypedNumber("1e3", "de-DE")).toBe(1000)
  })

  it("is written for typing in the reader's locale, so reading it back gives the same number", () => {
    for (const locale of ["de-DE", "fr-FR", "en-IN", "en-US"]) {
      for (const n of [1234.56, -0.5, 1e21, 1.5e-7, 0]) expect(parseTypedNumber(typedNumberText(n, locale), locale)).toBe(n)
    }
    expect(typedNumberText(1234.5, "de-DE")).toBe("1234,5")
    expect(typedNumberText("1200.5", "de-DE")).toBe("1200,5")
    expect(typedNumberText("TBD", "de-DE")).toBe("TBD")
    expect(typedNumberText(null)).toBe("")
  })
})

describe("a number typed into any box", () => {
  it("is the number read in the reader's locale, or null when it's blank or isn't one", () => {
    expect(typedNumber("1,5", "de-DE")).toBe(1.5)
    expect(typedNumber("1,500", "en-US")).toBe(1500)
    expect(typedNumber("18,5", "en-US")).toBeNull()
    expect(typedNumber("  ", "en-US")).toBeNull()
    expect(typedNumber("TBD", "en-US")).toBeNull()
  })
})

describe("the reader's signs, and numbers as programs write them", () => {
  it("names each locale's decimal and group signs, as a server is told them", () => {
    expect(numberSigns("de-DE")).toEqual({ decimal: ",", group: "." })
    expect(numberSigns("en-IN")).toEqual({ decimal: ".", group: "," })
    expect(numberSigns("de-DE")).toBe(numberSigns("de-DE"))
  })

  it("reads a stored number, or text a program wrote as one, and nothing else", () => {
    expect(plainNumberOf(-120)).toBe(-120)
    expect(plainNumberOf("-15.5")).toBe(-15.5)
    expect(plainNumberOf("1e3")).toBe(1000)
    expect(plainNumberOf("1,200")).toBeNull()
    expect(plainNumberOf("TBD")).toBeNull()
    expect(plainNumberOf(Number.NaN)).toBeNull()
    expect(plainNumberOf(null)).toBeNull()
  })
})

