import { describe, expect, it } from "vitest"
import { FORMULA_FUNCTIONS, fieldRef, insertAt, showFormulaValue } from "@/lib/tables/formula"

// The server's functions (business/DataTable/formula/funcs.go), less CONCAT,
// which is CONCATENATE's other name. Change both when one changes.
const SERVER = [
  "ABS", "AND", "AVERAGE", "BLANK", "CEILING", "CONCATENATE", "DATEADD", "DATETIME_DIFF", "DAY", "FIND", "FLOOR",
  "IF", "ISBLANK", "ISERROR", "LEFT", "LEN", "LOWER", "MAX", "MID", "MIN", "MOD", "MONTH", "NOT", "NOW", "OR",
  "POWER", "REPT", "RIGHT", "ROUND", "ROUNDDOWN", "ROUNDUP", "SQRT", "SUBSTITUTE", "SUM", "SWITCH", "TODAY",
  "TRIM", "UPPER", "VALUE", "WEEKDAY", "WORKDAY_DIFF", "YEAR",
]

describe("the functions the editor lists", () => {
  it("are the server's, each once", () => {
    const names = FORMULA_FUNCTIONS.flatMap((g) => g.items.map((f) => f.name))
    expect([...names].sort()).toEqual([...SERVER].sort())
  })

  it("each say how they're written", () => {
    for (const f of FORMULA_FUNCTIONS.flatMap((g) => g.items)) {
      expect(f.syntax.startsWith(`${f.name}(`), f.name).toBe(true)
      expect(f.about.length, f.name).toBeGreaterThan(0)
    }
  })
})

describe("a formula's cell", () => {
  it("shows what the server worked out", () => {
    expect(showFormulaValue(1234.5, "number")).toEqual({ kind: "number", text: (1234.5).toLocaleString() })
    expect(showFormulaValue(true, "checkbox")).toEqual({ kind: "checkbox", checked: true })
    expect(showFormulaValue("Late", "text")).toEqual({ kind: "text", text: "Late" })
    expect(showFormulaValue(null, "number")).toEqual({ kind: "blank" })
    expect(showFormulaValue(undefined, "text")).toEqual({ kind: "blank" })
  })

  it("shows a day as a date, in the reader's own words, on the day it is", () => {
    const shown = showFormulaValue("2026-10-12", "date")
    expect(shown.kind).toBe("date")
    // Not shifted by the reader's time zone: 12 October stays the 12th.
    expect(shown.kind === "date" && shown.text).toContain("12")
    // Text that only looks like a date stays text.
    expect(showFormulaValue("2026-10-12", "text")).toEqual({ kind: "text", text: "2026-10-12" })
  })

  it("says what went wrong", () => {
    expect(showFormulaValue({ error: "Divided by zero" }, "number")).toEqual({ kind: "error", message: "Divided by zero" })
  })
})

describe("writing a formula", () => {
  it("puts a field in braces, escaping what would end them", () => {
    expect(fieldRef("Price")).toBe("{Price}")
    expect(fieldRef("Cost {net}")).toBe("{Cost {net\\}}")
  })

  it("inserts at the caret, over a selection", () => {
    expect(insertAt("{Price} * ", 10, 10, "{Quantity}")).toEqual({ text: "{Price} * {Quantity}", caret: 20 })
    expect(insertAt("SUM(x)", 4, 5, "{Price}")).toEqual({ text: "SUM({Price})", caret: 11 })
  })
})
