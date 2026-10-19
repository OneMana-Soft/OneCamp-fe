import { describe, expect, it } from "vitest"

import { openingMinute, type OpeningItem } from "./openAt"

// Minutes of the day, for reading the cases.
const h = (hours: number, minutes = 0) => hours * 60 + minutes
const item = (from: number, to: number, carried = false): OpeningItem => ({ topMin: from, endMin: to, carried })
const week = (byDay: Record<number, OpeningItem[]>) => Array.from({ length: 7 }, (_, i) => byDay[i] ?? [])

describe("where a week grid opens", () => {
  it("shows now and the next meeting together when both fit", () => {
    expect(openingMinute(week({ 3: [item(h(11), h(12))] }), 3, h(9), h(10))).toBe(h(8))
  })

  it("opens on an evening meeting, with an hour above it, when now and it don't fit (the demo's empty grid)", () => {
    // 8 am, and every meeting at 6:45 pm or later.
    const evening = week({ 3: [item(h(18, 45), h(19, 30)), item(h(20), h(21))], 4: [item(h(19), h(20))] })
    expect(openingMinute(evening, 3, h(8), h(10))).toBe(h(17, 45))
  })

  it("keeps a meeting already running in view, from its start", () => {
    expect(openingMinute(week({ 3: [item(h(13), h(17))] }), 3, h(16), h(10))).toBe(h(12))
  })

  it("passes over today's meetings that have ended, to the next one", () => {
    const day = week({ 3: [item(h(8), h(9)), item(h(15), h(16))] })
    expect(openingMinute(day, 3, h(10), h(10))).toBe(h(9))
    expect(openingMinute(day, 3, h(10), h(4))).toBe(h(14))
  })

  it("with nothing left today, aims at the first meeting of a later day in view", () => {
    const later = week({ 1: [item(h(7), h(8))], 3: [item(h(9), h(10))], 5: [item(h(19), h(20))], 6: [item(h(18), h(19))] })
    expect(openingMinute(later, 3, h(11), h(10))).toBe(h(10))
    expect(openingMinute(later, 3, h(11), h(6))).toBe(h(17))
  })

  it("never goes back to a later day's early hours, away from now (PTC-8)", () => {
    // Wednesday 1:20 pm, and only Copy sync at 00:30 on Saturday.
    expect(openingMinute(week({ 5: [item(h(0, 30), h(1, 30))] }), 2, h(13, 20), h(10))).toBe(h(12, 20))
    // A later day's evening still counts.
    expect(openingMinute(week({ 5: [item(h(0, 30), h(1, 30))], 6: [item(h(19), h(20))] }), 2, h(13, 20), h(4))).toBe(h(18))
  })

  it("with nothing timed to come, opens an hour before now, at 4 pm at the latest", () => {
    expect(openingMinute(week({}), 3, h(9, 30), h(10))).toBe(h(8, 30))
    expect(openingMinute(week({ 1: [item(h(9), h(10))] }), 3, h(23), h(10))).toBe(h(16))
  })

  it("in a week without today, opens on its earliest meeting, else at 8 am", () => {
    expect(openingMinute(week({ 2: [item(h(10), h(11))], 4: [item(h(7, 30), h(8))] }), -1, h(9))).toBe(h(6, 30))
    expect(openingMinute(week({}), -1, h(9))).toBe(h(8))
  })

  it("never counts a span carried over from the night before, which starts at midnight on the grid", () => {
    const overnight = week({ 3: [item(0, h(6), true), item(h(19), h(20))] })
    expect(openingMinute(overnight, 3, h(8), h(10))).toBe(h(18))
    expect(openingMinute(week({ 2: [item(0, h(2), true)] }), -1, h(9))).toBe(h(8))
  })

  it("assumes about ten hours of view where the grid can't measure itself", () => {
    expect(openingMinute(week({ 3: [item(h(16), h(17))] }), 3, h(8))).toBe(h(7))
    expect(openingMinute(week({ 3: [item(h(17), h(18))] }), 3, h(8))).toBe(h(16))
  })
})
