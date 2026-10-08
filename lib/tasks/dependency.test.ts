import { describe, expect, it } from "vitest"
import { endsOf, parseLag, wayKept, wayOf, waySentence, wayShort, withWay } from "@/lib/tasks/dependency"

const day = (d: number) => new Date(2026, 9, d)

describe("a dependency's kind and lag", () => {
  it("reads from either end, and is finish to start with no lag when it says nothing", () => {
    expect(wayOf({})).toEqual({ kind: "fs", lag: 0 })
    expect(wayOf({ "task_blocked_by|kind": "ss", "task_blocked_by|lag": -2 })).toEqual({ kind: "ss", lag: -2 })
    expect(wayOf({ "task_blocks|kind": "ff", "task_blocks|lag": 3 })).toEqual({ kind: "ff", lag: 3 })
    expect(wayOf({ "task_blocked_by|kind": "later" })).toEqual({ kind: "fs", lag: 0 })
  })

  it("writes back the facets the server would send, with no lag left over", () => {
    const was = { task_uuid: "design", "task_blocked_by|kind": "ss", "task_blocked_by|lag": 2 }
    expect(withWay(was, "task_blocked_by", { kind: "fs", lag: 0 })).toStrictEqual({ task_uuid: "design", "task_blocked_by|kind": "fs" })
    expect(withWay({ task_uuid: "build" }, "task_blocks", { kind: "sf", lag: 1 })).toStrictEqual({ task_uuid: "build", "task_blocks|kind": "sf", "task_blocks|lag": 1 })
    expect(wayOf(withWay({}, "task_blocks", { kind: "sf", lag: 1 }))).toEqual({ kind: "sf", lag: 1 })
    expect(was["task_blocked_by|lag"]).toBe(2)
  })

  it("ties the ends its name says", () => {
    expect(endsOf("fs")).toEqual({ from: "end", to: "start" })
    expect(endsOf("ss")).toEqual({ from: "start", to: "start" })
    expect(endsOf("ff")).toEqual({ from: "end", to: "end" })
    expect(endsOf("sf")).toEqual({ from: "start", to: "end" })
  })

  it("says what it means, naming both tasks", () => {
    expect(waySentence({ kind: "fs", lag: 0 }, "Build", "Design")).toBe("Build can't start until Design finishes.")
    expect(waySentence({ kind: "fs", lag: 2 }, "Build", "Design")).toBe("Build can't start until 2 days after Design finishes.")
    expect(waySentence({ kind: "ss", lag: -1 }, "Build", "Design")).toBe("Build can't start until 1 day before Design starts.")
    expect(waySentence({ kind: "ff", lag: 0 }, "Test", "Build")).toBe("Test can't finish until Build finishes.")
    expect(waySentence({ kind: "sf", lag: 0 }, "Old shift", "New shift")).toBe("Old shift can't finish until New shift starts.")
    expect(wayShort({ kind: "fs", lag: 0 })).toBe("Finish to start")
    expect(wayShort({ kind: "ss", lag: 2 })).toBe("Start to start +2d")
    expect(wayShort({ kind: "ff", lag: -3 })).toBe("Finish to finish −3d")
  })

  it("takes a lag as typed, in whole days up to a year either way", () => {
    expect(parseLag("")).toBe(0)
    expect(parseLag(" 3 ")).toBe(3)
    expect(parseLag("+3")).toBe(3)
    expect(parseLag("-2")).toBe(-2)
    expect(parseLag("−2")).toBe(-2)
    expect(parseLag("365")).toBe(365)
    expect(parseLag("366")).toBeNull()
    expect(parseLag("1.5")).toBeNull()
    expect(parseLag("two")).toBeNull()
  })

  it("is kept when the waiting task's tied day is late enough", () => {
    const design = { start: day(5), end: day(7) }
    // Finish to start begins the day after; a lag adds days, or takes them away.
    expect(wayKept({ kind: "fs", lag: 0 }, design, { start: day(8), end: day(9) })).toBe(true)
    expect(wayKept({ kind: "fs", lag: 0 }, design, { start: day(7), end: day(9) })).toBe(false)
    expect(wayKept({ kind: "fs", lag: -1 }, design, { start: day(7), end: day(9) })).toBe(true)
    // Start to finish: it can't end before Design starts.
    expect(wayKept({ kind: "sf", lag: 0 }, design, { start: day(1), end: day(5) })).toBe(true)
    expect(wayKept({ kind: "sf", lag: 0 }, design, { start: day(1), end: day(4) })).toBe(false)
  })
})
