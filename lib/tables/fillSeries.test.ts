import { describe, expect, it } from "vitest"
import { fillSeries } from "@/lib/tables/fillSeries"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

describe("fillSeries: what the fill handle writes", () => {
  it("continues numbers in an even step, and copies a lone number", () => {
    expect(fillSeries([1, 2], 3, { kind: "number" })).toEqual([3, 4, 5])
    expect(fillSeries([10, 7], 2, { kind: "number" })).toEqual([4, 1])
    expect(fillSeries([5], 3, { kind: "number" })).toEqual([5, 5, 5])
  })

  it("rounds a decimal step to the sources' places", () => {
    expect(fillSeries([0.1, 0.2], 2, { kind: "number" })).toEqual([0.3, 0.4])
  })

  it("repeats numbers whose steps differ", () => {
    expect(fillSeries([1, 2, 4], 4, { kind: "number" })).toEqual([1, 2, 4, 1])
  })

  it("steps a lone date a day, across the month's end", () => {
    expect(fillSeries(["2026-10-30"], 3, { kind: "date" })).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"])
  })

  it("continues an even day step", () => {
    expect(fillSeries(["2026-10-30", "2026-11-01"], 2, { kind: "date" })).toEqual(["2026-11-03", "2026-11-05"])
  })

  it("continues an even month step on the first date's day, clamped to short months", () => {
    expect(fillSeries(["2026-01-15", "2026-02-15"], 2, { kind: "date" })).toEqual(["2026-03-15", "2026-04-15"])
    expect(fillSeries(["2025-12-31", "2026-01-31"], 2, { kind: "date" })).toEqual(["2026-02-28", "2026-03-31"])
  })

  it("steps the number a text ends in, keeping its zero padding", () => {
    expect(fillSeries(["Item 9"], 2, { kind: "text" })).toEqual(["Item 10", "Item 11"])
    expect(fillSeries(["Q09"], 2, { kind: "text" })).toEqual(["Q10", "Q11"])
    expect(fillSeries(["A1", "A3"], 2, { kind: "text" })).toEqual(["A5", "A7"])
  })

  it("repeats anything else in turn: words, options, ticks, mixed texts", () => {
    expect(fillSeries(["a", "b"], 5, { kind: "text" })).toEqual(["a", "b", "a", "b", "a"])
    expect(fillSeries(["Open", "Done"], 3, { kind: "select" })).toEqual(["Open", "Done", "Open"])
    expect(fillSeries([true], 2, { kind: "checkbox" })).toEqual([true, true])
    expect(fillSeries(["A1", "B2"], 2, { kind: "text" })).toEqual(["A1", "B2"])
  })

  it("never steps a number or a date held in a text column or an option", () => {
    expect(fillSeries(["2026-10-30"], 1, { kind: "text" })).toEqual(["2026-10-30"])
    expect(fillSeries([1, 2], 1, { kind: "select" })).toEqual([1])
  })

  it("fills upwards by running the sequence backwards, in top-to-bottom order", () => {
    expect(fillSeries([3, 4], 2, { kind: "number", up: true })).toEqual([1, 2])
    expect(fillSeries(["2026-11-01"], 2, { kind: "date", up: true })).toEqual(["2026-10-30", "2026-10-31"])
    expect(fillSeries(["a", "b"], 3, { kind: "text", up: true })).toEqual(["b", "a", "b"])
  })

  it("leaves empty sources empty and asks nothing of zero cells", () => {
    expect(fillSeries([null], 2, { kind: "number" })).toEqual([null, null])
    expect(fillSeries([1, 2], 0, { kind: "number" })).toEqual([])
  })
})

describe("fillSeries copy: Ctrl+D copies, it never steps", () => {
  it("repeats the sources as they are, down and up", () => {
    expect(fillSeries([1, 2], 4, { kind: "number", copy: true })).toEqual([1, 2, 1, 2])
    expect(fillSeries(["2026-10-31"], 2, { kind: "date", copy: true })).toEqual(["2026-10-31", "2026-10-31"])
    expect(fillSeries(["Item 1"], 2, { kind: "text", copy: true })).toEqual(["Item 1", "Item 1"])
    expect(fillSeries(["a", "b"], 3, { kind: "text", copy: true, up: true })).toEqual(["b", "a", "b"])
  })
})
