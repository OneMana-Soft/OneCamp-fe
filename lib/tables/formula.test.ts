import { describe, expect, it } from "vitest"
import { cardTitle, showFormulaValue } from "@/lib/tables/formula"
import { pinTestClock } from "@/lib/testing/testClock"

// Every test here reads dates against one moment: 18 Oct 2026, noon.
pinTestClock(new Date(2026, 9, 18, 12, 0))
import { FORMULA_FUNCTIONS, fieldRef, insertAt } from "@/lib/tables/formulaCatalogue"

// The server's 94 functions (business/Formula/funcs*.go), less CONCAT,
// which is CONCATENATE's other name. Change both when one changes.
const SERVER = [
  "ABS", "AND", "ARRAYCOMPACT", "ARRAYFLATTEN", "ARRAYJOIN", "ARRAYSLICE", "ARRAYUNIQUE", "AVERAGE", "BLANK",
  "CEILING", "CONCATENATE", "CONTAINS", "COUNT", "COUNTA", "COUNTALL", "CREATED_TIME", "CURRENT", "DATEADD", "DATESTR",
  "DATETIME_DIFF", "DATETIME_FORMAT", "DATETIME_PARSE", "DAY", "ENCODE_URL_COMPONENT", "ERROR", "EVEN", "EXP",
  "FALSE", "FILTER", "FIND", "FLOOR", "FROMNOW", "HOUR", "IF", "IFS", "INT", "ISBLANK", "ISERROR", "IS_AFTER", "IS_BEFORE",
  "IS_SAME", "LAST_MODIFIED_TIME", "LEFT", "LEN", "LN", "LOG", "LOWER", "MAP", "MAX", "MID", "MIN", "MINUTE", "MOD",
  "MONTH", "NOT", "NOW", "ODD", "OR", "PI", "POWER", "RECORD_ID", "REGEX_EXTRACT", "REGEX_MATCH", "REGEX_REPLACE",
  "REPLACE", "REPT", "RIGHT", "ROUND", "ROUNDDOWN", "ROUNDUP", "SEARCH", "SECOND", "SET_LOCALE", "SET_TIMEZONE",
  "SIGN", "SQRT", "SUBSTITUTE", "SUM", "SWITCH", "T", "TIMESTR", "TODAY", "TONOW", "TRIM", "TRUE", "UPPER", "VALUE",
  "WEEKDAY", "WEEKNUM", "WORKDAY", "WORKDAY_DIFF", "XOR", "YEAR",
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

describe("a card's title", () => {
  const field = (type: string, config = "{}") => ({ id: "f", table_id: "t", name: "F", type, config, position: 0 }) as never
  it("shows a formula as its cell does, and anything else as written", () => {
    expect(cardTitle(field("formula", JSON.stringify({ result: "number" })), 1200)).toBe((1200).toLocaleString())
    expect(cardTitle(field("formula", JSON.stringify({ result: "text" })), { error: "Divided by zero" })).toBe("Error")
    expect(cardTitle(field("text"), "Launch film")).toBe("Launch film")
    expect(cardTitle(field("text"), undefined)).toBe("")
  })

  it("names the rows a relation links to, without its count of the rest", () => {
    const refs = [
      { id: "a", label: "Acme", type: "row" },
      { id: "g", label: "Globex", type: "row" },
      { id: "", label: "50 more", type: "more" },
    ]
    expect(cardTitle(field("relation", JSON.stringify({ relation_target: "table", table_id: "v" })), refs)).toBe("Acme, Globex")
  })
})

describe("a formula's or a rollup's result format (B2)", () => {
  it("writes a number in its format, or as a duration", () => {
    expect(showFormulaValue(1234.5, "number", { currency: "INR", decimals: 2 })).toEqual({ kind: "number", text: `₹${(1234.5).toLocaleString(undefined, { minimumFractionDigits: 2 })}` })
    expect(showFormulaValue(42, "number", { percent: true }).kind === "number" && (showFormulaValue(42, "number", { percent: true }) as { text: string }).text).toBe("42%")
    expect(showFormulaValue(5400, "number", { duration: "h:mm" })).toEqual({ kind: "number", text: "1h 30m" })
    expect(showFormulaValue(-3, "number", {})).toEqual({ kind: "number", text: "−3" })
  })

  it("writes a date short, long, as ISO or how long ago", () => {
    expect((showFormulaValue("2026-10-12", "date", { date: "iso" }) as { text: string }).text).toBe("2026-10-12")
    expect((showFormulaValue("2026-10-12", "date", { date: "long" }) as { text: string }).text).toContain("October 2026")
    expect((showFormulaValue("2026-10-15", "date", { date: "relative" }) as { text: string }).text).toBe("3 days ago")
  })

  it("gives a card's title in the field's format", () => {
    const f = { id: "f", table_id: "t", name: "Spend", type: "rollup" as const, config: JSON.stringify({ result: "number", format: { currency: "USD" } }), position: 0 }
    expect(cardTitle(f, 20)).toBe("$20")
  })
})
