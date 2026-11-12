import { describe, expect, it } from "vitest"
import { formulaLine, showFormulaValue, type FormulaWriter } from "@/lib/tables/formulaValue"
import { pinTestClock } from "@/lib/testing/testClock"

// A formula's dates read the clock: pinned, not the machine's.
pinTestClock()

// The one display rule for a formula's value (J-F WEB): tables and tasks
// alike, each with its own way of writing numbers and dates.
const write: FormulaWriter = { number: (n) => `n${n}`, date: (_d, s, day) => (day ? `day ${s}` : `moment ${s}`) }

describe("showFormulaValue", () => {
  it("reads a value by what the server sent and the formula's result", () => {
    expect(showFormulaValue(undefined, "number", write)).toEqual({ kind: "blank" })
    expect(showFormulaValue("", "text", write)).toEqual({ kind: "blank" })
    expect(showFormulaValue(12.5, "number", write)).toEqual({ kind: "number", text: "n12.5" })
    expect(showFormulaValue(false, "checkbox", write)).toEqual({ kind: "checkbox", checked: false })
    expect(showFormulaValue("2026-11-08", "date", write)).toEqual({ kind: "date", text: "day 2026-11-08" })
    expect(showFormulaValue("2026-11-08T09:30:00Z", "date", write)).toEqual({ kind: "date", text: "moment 2026-11-08T09:30:00Z" })
    expect(showFormulaValue("2026-11-08", "text", write)).toEqual({ kind: "text", text: "2026-11-08" })
  })

  it("says what went wrong in the server's words, or plainly", () => {
    expect(showFormulaValue({ error: "Spend was deleted" }, "number", write)).toEqual({ kind: "error", message: "Spend was deleted" })
    expect(showFormulaValue({}, "number", write)).toEqual({ kind: "error", message: "This can't be worked out" })
  })
})

describe("formulaLine", () => {
  it("writes each kind as one line", () => {
    expect(formulaLine({ kind: "blank" })).toBe("")
    expect(formulaLine({ kind: "error", message: "x" })).toBe("Error")
    expect(formulaLine({ kind: "checkbox", checked: true })).toBe("Yes")
    expect(formulaLine({ kind: "checkbox", checked: false })).toBe("No")
    expect(formulaLine({ kind: "number", text: "3" })).toBe("3")
  })
})
