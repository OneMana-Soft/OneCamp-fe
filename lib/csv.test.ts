import { describe, expect, it } from "vitest"
import { csvCell, csvLine } from "@/lib/csv"

// One CSV writer for the app (tables, reports, the data inventory): the
// tables W0 audit found three, one still writing negatives as text and one
// with no guard against formulas.
describe("a CSV cell", () => {
  it("writes a number as a number, negatives too", () => {
    expect(csvLine([-120, 1.5, 0, "x"])).toBe("-120,1.5,0,x")
    expect(csvCell(Number.NaN)).toBe("")
  })

  it("keeps as text whatever starts like a formula, by OWASP's whole list", () => {
    for (const s of ["=SUM(A1)", "+1", "-note", "@cmd", "\t=1", "\r=1", "\n=1", "＝1+1", "＋1", "－1", "＠x"]) {
      expect(csvCell(s).startsWith(`"'`)).toBe(true)
    }
    expect(csvCell("-120")).toBe(`"'-120"`)
  })

  it("quotes commas, quotes and line breaks, and leaves the rest as it is", () => {
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"')
    expect(csvCell("two\nlines")).toBe('"two\nlines"')
    expect(csvCell("plain")).toBe("plain")
  })
})
