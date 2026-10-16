import { describe, expect, it } from "vitest"
import { OUTLINE_MIN_HEADINGS, OUTLINE_MIN_WIDTH, OUTLINE_ROOM, activeHeading, outlinePlace } from "./DocOutline"

// The floating outline (B2; editor.md P1-11): where it stands, when it
// shows, and which heading it marks as the reader scrolls.

describe("the floating outline", () => {
  const scroller = { right: 1240, top: 60 }
  const measure = { right: 1000 }

  it("shows from 1,280 px wide with three headings or more, where there is room right of the text", () => {
    expect(outlinePlace({ width: OUTLINE_MIN_WIDTH }, scroller, measure, OUTLINE_MIN_HEADINGS)).toEqual({ right: OUTLINE_MIN_WIDTH - 1240 + 16, top: 60 + 96 })
    expect(outlinePlace({ width: OUTLINE_MIN_WIDTH - 1 }, scroller, measure, 5)).toBeNull()
    expect(outlinePlace({ width: 1440 }, scroller, measure, OUTLINE_MIN_HEADINGS - 1)).toBeNull()
    expect(outlinePlace({ width: 1440 }, scroller, { right: scroller.right - OUTLINE_ROOM + 1 }, 5)).toBeNull()
    expect(outlinePlace({ width: 1440 }, scroller, null, 5)).toBeNull()
  })

  it("marks the last heading the reader has passed, the first before any", () => {
    expect(activeHeading([false, false, false])).toBe(0)
    expect(activeHeading([true, false, false])).toBe(0)
    expect(activeHeading([true, true, false])).toBe(1)
    expect(activeHeading([true, true, true])).toBe(2)
  })
})
