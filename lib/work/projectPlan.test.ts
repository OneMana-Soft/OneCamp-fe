import { describe, expect, it } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { categoryKind, nextLabelColor, periodOf, periodsOfYear, spanWords, whenOf, whenWords, type PlanWhen } from "@/lib/work/projectPlan"

pinTestClock()

const w = (date: string, resolution: PlanWhen["resolution"]): PlanWhen => ({ date, resolution })

describe("a plan's periods, as the server's Period has them (linear-15)", () => {
  it("finds the first and last day at each resolution, leap days and year ends included", () => {
    expect(periodOf("2027-08-14", "day")).toEqual({ first: "2027-08-14", last: "2027-08-14" })
    expect(periodOf("2028-02-10", "month")).toEqual({ first: "2028-02-01", last: "2028-02-29" })
    expect(periodOf("2027-02-10", "month")).toEqual({ first: "2027-02-01", last: "2027-02-28" })
    expect(periodOf("2027-11-30", "quarter")).toEqual({ first: "2027-10-01", last: "2027-12-31" })
    expect(periodOf("2027-04-01", "quarter")).toEqual({ first: "2027-04-01", last: "2027-06-30" })
    expect(periodOf("2027-06-30", "half")).toEqual({ first: "2027-01-01", last: "2027-06-30" })
    expect(periodOf("2027-07-01", "half")).toEqual({ first: "2027-07-01", last: "2027-12-31" })
    expect(periodOf("2027-07-01", "year")).toEqual({ first: "2027-01-01", last: "2027-12-31" })
  })

  it("sends a start as its period's first day and a target as its last", () => {
    expect(whenOf("2027-08-14", "quarter", "start")).toEqual(w("2027-07-01", "quarter"))
    expect(whenOf("2027-08-14", "quarter", "target")).toEqual(w("2027-09-30", "quarter"))
    expect(whenOf("2027-08-14", "day", "target")).toEqual(w("2027-08-14", "day"))
  })

  it("offers a year's months, quarters, halves or the year itself, each with a day inside it", () => {
    expect(periodsOfYear(2027, "month").map((p) => p.label)).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])
    expect(periodsOfYear(2027, "quarter")).toEqual([
      { label: "Q1", day: "2027-01-01" },
      { label: "Q2", day: "2027-04-01" },
      { label: "Q3", day: "2027-07-01" },
      { label: "Q4", day: "2027-10-01" },
    ])
    expect(periodsOfYear(2027, "half").map((p) => p.day)).toEqual(["2027-01-01", "2027-07-01"])
    expect(periodsOfYear(2027, "year")).toEqual([{ label: "2027", day: "2027-01-01" }])
  })
})

describe("a plan's dates in words", () => {
  it("says a date as finely as it was chosen", () => {
    expect(whenWords(w("2027-03-14", "day"))).toBe("14 Mar 2027")
    expect(whenWords(w("2027-03-31", "month"))).toBe("Mar 2027")
    expect(whenWords(w("2027-09-30", "quarter"))).toBe("Q3 2027")
    expect(whenWords(w("2027-12-31", "half"))).toBe("H2 2027")
    expect(whenWords(w("2027-12-31", "year"))).toBe("2027")
    expect(whenWords(null)).toBe("")
  })

  it("says a span with a shared year once, and either end alone in words of its own", () => {
    expect(spanWords(w("2027-01-01", "quarter"), w("2027-09-30", "quarter"))).toBe("Q1 → Q3 2027")
    expect(spanWords(w("2027-03-14", "day"), w("2027-06-30", "month"))).toBe("14 Mar → Jun 2027")
    expect(spanWords(w("2026-11-01", "month"), w("2027-03-31", "quarter"))).toBe("Nov 2026 → Q1 2027")
    expect(spanWords(w("2027-01-01", "year"), w("2027-12-31", "year"))).toBe("2027")
    expect(spanWords(w("2027-01-01", "year"), w("2027-06-30", "half"))).toBe("2027 → H1 2027")
    expect(spanWords(w("2027-03-01", "month"), null)).toBe("From Mar 2027")
    expect(spanWords(null, w("2027-09-30", "quarter"))).toBe("Target Q3 2027")
    expect(spanWords(null, null)).toBe("")
  })
})

describe("a plan's status and labels as they draw", () => {
  it("draws each category as the task glyph of the same meaning, an unknown one as planned", () => {
    expect(["planned", "in_progress", "paused", "done", "cancelled", "other"].map(categoryKind)).toEqual(["todo", "progress", "paused", "done", "cancelled", "todo"])
  })

  it("gives new labels the camp hues in turn, never slate", () => {
    const hues = Array.from({ length: 7 }, (_, i) => nextLabelColor(i))
    expect(hues).not.toContain("slate")
    expect(new Set(hues.slice(0, 6)).size).toBe(6)
    expect(hues[6]).toBe(hues[0])
  })
})
