import { describe, expect, it } from "vitest"
import { summarizeServed } from "@/lib/tables/summary"
import { pinTestClock } from "@/lib/testing/testClock"
import type { TableField } from "@/services/tableService"

// A span writes its days without their year in the year it is: every test runs on the tests' own today.
pinTestClock()

const field = (type: TableField["type"], config = "{}"): TableField => ({ id: "f", table_id: "t", name: "F", type, config, position: 0 })

// The server's summary of every row a view keeps (QUERY_STACK_CONTRACT item
// 8), written as the bar writes its own of the rows loaded.
describe("a summary the server worked out", () => {
  it("writes each function as the bar writes it", () => {
    expect(summarizeServed(field("number"), "average", { average: 1234.5678 })).toEqual({ label: "Average", value: "1,234.57" })
    expect(summarizeServed(field("duration"), "sum", { sum: 45000 })).toMatchObject({ label: "Sum", value: "12h 30m" })
    expect(summarizeServed(field("number"), "pct_filled", { pct_filled: 83.33333 })).toEqual({ label: "% filled", value: "83%" })
    expect(summarizeServed(field("checkbox"), "unchecked", { unchecked: 3, count: 6 })).toEqual({ label: "Unchecked", value: "3 of 6" })
    expect(summarizeServed(field("text"), "empty", { empty: 1200 })).toEqual({ label: "Empty", value: "1,200" })
  })
  it("writes a sum of nothing as a dash, and a span from its earliest to its latest", () => {
    expect(summarizeServed(field("number"), "max", { max: null })).toEqual({ label: "Max", value: "–" })
    expect(summarizeServed(field("created_time"), "span", { range: null })).toEqual({ label: "Earliest to latest", value: "–" })
    const span = summarizeServed(field("created_time"), "span", { range: ["2026-10-01T09:00:00Z", "2026-10-06T09:00:00Z"] })
    expect(span?.value).toMatch(/–/)
    expect(span?.title).toMatch(/^Earliest to latest: .+ to .+$/)
  })
  it("answers nothing for a function the server wasn't asked, and none for none", () => {
    expect(summarizeServed(field("number"), "median", { sum: 3 })).toBeUndefined()
    expect(summarizeServed(field("checkbox"), "checked", { checked: 3 })).toBeUndefined()
    expect(summarizeServed(field("status"), "groups", undefined)).toBeUndefined()
    expect(summarizeServed(field("number"), "none", { sum: 3 })).toBeNull()
  })
})
