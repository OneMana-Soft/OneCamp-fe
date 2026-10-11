import { describe, expect, it } from "vitest"
import { blockGeometry, packDay } from "@/components/calendar/weekView"
import { clickRange, createRange, durationLabel, minutesAt, moveRange, resizeRange } from "./calendarDrag"

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

describe("overlapping events", () => {
  const it3 = (topMin: number, endMin: number) => ({ topMin, endMin, col: 0, cols: 1 })
  it("split two ways, and cascade from three", () => {
    const two = packDay([it3(600, 660), it3(630, 690)])
    expect(two.map((x) => x.cols)).toEqual([2, 2])
    expect(blockGeometry(1, 2).left).toBe("calc(50% + 1px)")
    const three = packDay([it3(600, 660), it3(610, 670), it3(620, 680)])
    expect(three.every((x) => x.cols === 3)).toBe(true)
    expect(blockGeometry(2, 3)).toEqual({ left: "26px", width: "calc(100% - 28px)" })
  })
})
