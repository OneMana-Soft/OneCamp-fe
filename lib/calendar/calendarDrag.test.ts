import { describe, expect, it } from "vitest"
import { blockGeometry, packDay } from "@/components/calendar/weekView"
import { clickRange, createRange, durationLabel, keyNudge, minutesAt, moveRange, resizeRange } from "./calendarDrag"

// content.md C13: every drag snaps to 15 minutes.
describe("dragging on the calendar", () => {
  it("draws a new event from the press to the pointer, snapped out to quarter hours", () => {
    expect(createRange(600, 670)).toEqual({ startMin: 600, endMin: 675 })
    expect(createRange(670, 607)).toEqual({ startMin: 600, endMin: 675 })
    expect(createRange(600, 601)).toEqual({ startMin: 600, endMin: 615 })
  })

  it("makes a half-hour draft from a click", () => {
    expect(clickRange(608)).toEqual({ startMin: 600, endMin: 630 })
    expect(clickRange(1435)).toEqual({ startMin: 1410, endMin: 1440 })
  })

  it("moves by whole quarter hours, inside the day", () => {
    expect(moveRange(600, 660, 22)).toEqual({ startMin: 615, endMin: 675 })
    expect(moveRange(1380, 1440, 60)).toEqual({ startMin: 1380, endMin: 1440 })
  })

  it("resizes one edge, never past the other", () => {
    expect(resizeRange(600, 660, "bottom", 700)).toEqual({ startMin: 600, endMin: 705 })
    expect(resizeRange(600, 660, "bottom", 590)).toEqual({ startMin: 600, endMin: 615 })
    expect(resizeRange(600, 660, "top", 700)).toEqual({ startMin: 645, endMin: 660 })
  })

  it("reads minutes from a 56px hour, and names a length", () => {
    expect(minutesAt(56 * 9.5, 56)).toBe(570)
    expect(durationLabel(45)).toBe("45 min")
    expect(durationLabel(90)).toBe("1 h 30")
  })
})

describe("moving an event from the keyboard", () => {
  const key = (k: string, mods: Partial<Record<"altKey" | "shiftKey" | "ctrlKey" | "metaKey", boolean>> = {}) => ({ key: k, altKey: true, shiftKey: false, ctrlKey: false, metaKey: false, ...mods })
  it("moves a snap with Alt+↑↓, a day with Alt+←→, and the end with Alt+Shift+↑↓", () => {
    expect(keyNudge(key("ArrowUp"))).toEqual({ minutes: -15, days: 0, end: false })
    expect(keyNudge(key("ArrowDown"))).toEqual({ minutes: 15, days: 0, end: false })
    expect(keyNudge(key("ArrowLeft"))).toEqual({ minutes: 0, days: -1, end: false })
    expect(keyNudge(key("ArrowRight"))).toEqual({ minutes: 0, days: 1, end: false })
    expect(keyNudge(key("ArrowDown", { shiftKey: true }))).toEqual({ minutes: 15, days: 0, end: true })
  })

  it("leaves every other key alone", () => {
    expect(keyNudge(key("ArrowUp", { altKey: false }))).toBeNull()
    expect(keyNudge(key("ArrowLeft", { shiftKey: true }))).toBeNull()
    expect(keyNudge(key("ArrowUp", { metaKey: true }))).toBeNull()
    expect(keyNudge(key("j"))).toBeNull()
  })
})

describe("overlapping events (PG2-30)", () => {
  type Placed = { topMin: number; endMin: number; col: number; cols: number; span: number }
  const ev = (topMin: number, endMin: number): Placed => ({ topMin, endMin, col: 0, cols: 1, span: 1 })
  const overlap = (a: Placed, b: Placed) => a.topMin < b.endMin && b.topMin < a.endMin
  /**
   * The layout's rules: two events that overlap never share a column; every
   * event stays inside its day (its columns add up to no more than the day's);
   * and each stretches right until the day's edge or a column taken while it runs.
   */
  const laidOut = (items: Placed[]) => {
    for (const a of items) {
      expect(a.col + a.span).toBeLessThanOrEqual(a.cols)
      for (const b of items) {
        if (a === b || !overlap(a, b)) continue
        expect(a.col + a.span <= b.col || b.col + b.span <= a.col).toBe(true)
        expect(a.cols).toBe(b.cols)
      }
      const next = a.col + a.span
      expect(next === a.cols || items.some((b) => b !== a && overlap(a, b) && b.col <= next && next < b.col + b.span)).toBe(true)
    }
  }
  /** Where blocks sit in a 704 px day: [left, right] in px, from blockGeometry's CSS. */
  const px = (css: string) => Function(`return ${css.replace(/calc/g, "").replace(/100%/g, "704").replace(/px/g, "")}`)() as number
  const box = (it: Placed) => {
    const g = blockGeometry(it.col, it.cols, it.span)
    return [px(g.left), px(g.left) + px(g.width)]
  }

  it("split two at a time in two, side by side", () => {
    const two = packDay([ev(600, 660), ev(630, 690)])
    expect(two.map((x) => [x.col, x.cols, x.span])).toEqual([[0, 2, 1], [1, 2, 1]])
    expect(two.map(box)).toEqual([[2, 350], [352, 702]])
  })

  it("set three or more side by side too, never cascaded over each other", () => {
    const four = packDay([ev(600, 660), ev(610, 670), ev(620, 680), ev(630, 690)])
    laidOut(four)
    expect(four.map((x) => x.col)).toEqual([0, 1, 2, 3])
    // The day's width, shared: each block ends 2 px before the next begins, the last 2 px before the edge.
    expect(four.map(box)).toEqual([[2, 175], [177, 350], [352, 525], [527, 702]])
  })

  it("stretch an event over the columns free to its right", () => {
    // 9–11 and 9–10 and 9:30–10:30 take three columns; 10:30–11 finds the middle free, and the right.
    const [long, short, mid, late] = packDay([ev(540, 660), ev(540, 600), ev(570, 630), ev(630, 660)])
    laidOut([long, short, mid, late])
    expect([long.col, short.col, mid.col, late.col]).toEqual([0, 1, 2, 1])
    expect(late.span).toBe(2)
    // From the middle column's left to the day's right edge.
    expect(box(late)[0]).toBeCloseTo(2 + 700 / 3, 6)
    expect(box(late)[1]).toBeCloseTo(702, 6)
  })

  it("keep an event alone at the full width", () => {
    const [solo] = packDay([ev(780, 840)])
    expect([solo.col, solo.cols, solo.span]).toEqual([0, 1, 1])
    expect(blockGeometry(0, 1)).toEqual({ left: "2px", width: "calc(100% - 4px)" })
  })

  it("lay out a busy day of twelve: none shares a column with another it overlaps", () => {
    const day = packDay([
      ev(480, 540), // 8:00 Gym
      ev(510, 570), // 8:30 Standup prep
      ev(540, 720), // 9:00 Focus: write the announcement
      ev(540, 570), // 9:00 Standup
      ev(570, 630), // 9:30 Support sync
      ev(600, 660), // 10:00 Interview: senior engineer
      ev(615, 645), // 10:15 Coffee with Maya
      ev(660, 720), // 11:00 Launch review
      ev(690, 750), // 11:30 Design crit
      ev(780, 840), // 13:00 Lunch
      ev(840, 900), // 14:00 1:1
      ev(870, 960), // 14:30 Planning
    ])
    expect(day).toHaveLength(12)
    laidOut(day)
    // The blocks that overlap in time never overlap across the day either.
    for (const a of day)
      for (const b of day) {
        if (a === b || !overlap(a, b)) continue
        const [al, ar] = box(a)
        const [bl, br] = box(b)
        expect(ar <= bl || br <= al).toBe(true)
      }
    expect(Math.max(...day.map((x) => x.cols))).toBe(4)
  })
})
