import { describe, expect, it } from "vitest"
import { alignsRight, isNumeric, writableValues, type FieldType, type TableField, type TableRow } from "@/services/tableService"
import { summarize } from "./summary"
import { toCsv } from "./csv"
import { valueText } from "./history"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// Tables B1's kinds where the grid adds them up, a copy of a row is written,
// a table is exported and a row's history is read.

const field = (id: string, type: FieldType, config: Record<string, unknown> = {}, name = id): TableField => ({ id, table_id: "t", name, type, config: JSON.stringify(config), position: 0 })
const rowsOf = (cells: Record<string, unknown>[]): TableRow[] =>
  cells.map((c, i) => ({ id: `r${i}`, table_id: "t", values: JSON.stringify(c), position: i, created_at: "", updated_at: "" }))

describe("a B1 column's footer (STEP5 spec E)", () => {
  const stage = field("s", "status", { options: [{ label: "Not started", group: "todo" }, { label: "Building", group: "doing" }, { label: "Shipped", group: "done" }] })

  it("counts a status's rows in each group, in words for a screen reader", () => {
    const got = summarize(stage, rowsOf([{ s: "Building" }, { s: "Shipped" }, { s: "Shipped" }, {}]), "groups")
    expect(got).toEqual({ label: "", value: "0 · 1 · 2", title: "0 to do, 1 in progress, 2 done", groups: { todo: 0, doing: 1, done: 2 } })
  })

  it("sums a duration as one, and averages a rating with its star", () => {
    expect(summarize(field("d", "duration"), rowsOf([{ d: 5400 }, { d: 39600 }]), "sum")?.value).toBe("12h 30m")
    expect(summarize(field("r", "rating"), rowsOf([{ r: 4 }, { r: 3 }, { r: 4 }, { r: 4 }, { r: 4 }]), "average")?.value).toBe("3.8 ★")
  })

  it("gives when rows were made from the earliest to the latest", () => {
    const got = summarize(field("m", "created_time"), rowsOf([{ m: "2026-10-12T09:00:00Z" }, { m: "2026-10-17T09:00:00Z" }, {}]), "span")
    expect(got?.value).toBe("12 Oct – 17 Oct")
    expect(summarize(field("m", "created_time"), rowsOf([{}]), "span")?.value).toBe("–")
  })
})

describe("a copy of a row (Duplicate)", () => {
  it("leaves out what a row says of itself, and writes people as their ids alone", () => {
    const fields = [field("n", "text"), field("p", "people"), field("id", "autonumber"), field("m", "created_time"), field("b", "modified_by")]
    const values = { n: "Acme", p: [{ id: "u1", type: "user", label: "Maya Iyer" }], id: 12, m: "2026-10-17T09:00:00Z", b: [{ id: "u1", type: "user", label: "Maya Iyer" }] }
    expect(writableValues(fields, values)).toEqual({ n: "Acme", p: [{ id: "u1", type: "user" }] })
  })
})

describe("an exported table", () => {
  it("writes a duration as its clock and an id as it's shown, as a spreadsheet reads them best", () => {
    const fields = [field("id", "autonumber", { prefix: "DEAL" }, "ID"), field("d", "duration", {}, "Took"), field("r", "rating", {}, "Stars"), field("p", "people", {}, "Owners")]
    const csv = toCsv(fields, rowsOf([{ id: 12, d: 5400, r: 4, p: [{ id: "u1", type: "user", label: "Maya Iyer" }] }]))
    expect(csv.split("\r\n")).toEqual(["ID,Took,Stars,Owners", "DEAL-12,1h 30m,4,Maya Iyer"])
  })
})

describe("a row's history", () => {
  it("quotes people by name, or says how many when the change kept only their ids, and a duration as its clock", () => {
    expect(valueText(field("p", "people"), [{ id: "u1", type: "user", label: "Maya Iyer" }])).toBe("Maya Iyer")
    expect(valueText(field("p", "people"), [{ id: "u1", type: "user" }, { id: "u2", type: "user" }])).toBe("2 people")
    expect(valueText(field("d", "duration"), 5400)).toBe("1h 30m")
  })
})

describe("where a column's values sit", () => {
  it("puts figures on the right, and a rating's stars and an id on the left as their cells draw them", () => {
    // An id's header and footer sat on the right while its key sat on the left, so a
    // scrolled grid hid "DEAL" under the frozen column and showed "-1" (the T3 shots).
    expect(["number", "duration", "rating", "autonumber"].map((t) => alignsRight(field("f", t as FieldType)))).toEqual([true, true, false, false])
    expect(isNumeric(field("f", "autonumber"))).toBe(true)
    expect(alignsRight(field("f", "text"))).toBe(false)
  })
})

describe("a formula's or a rollup's footer (B2)", () => {
  it("adds up in the result's format: a duration, a currency; plain without one", () => {
    const took = field("t", "formula", { result: "number", format: { duration: "h:mm" } })
    expect(summarize(took, rowsOf([{ t: 5400 }, { t: 2700 }, { t: 39600 }]), "sum")?.value).toBe("13h 15m")
    const spend = field("s", "rollup", { result: "number", format: { currency: "INR", decimals: 2 } })
    expect(summarize(spend, rowsOf([{ s: 1180 }, { s: 295 }]), "sum")?.value).toBe(`₹${(1475).toLocaleString(undefined, { minimumFractionDigits: 2 })}`)
    const plain = field("p", "formula", { result: "number" })
    expect(summarize(plain, rowsOf([{ p: 1.234 }, { p: 1 }]), "sum")?.value).toBe((2.23).toLocaleString())
  })
})
