import { describe, expect, it } from "vitest"

import { RIGHT_PANEL_DEFAULT_PX, RIGHT_PANEL_MIN_PX, THREAD_PANEL_DEFAULT_PX, THREAD_PANEL_MAX_PX, rightPanelDefaultSize, rightPanelKind, rightPanelMaxSize, rightPanelMinSize, rightPanelOpenSize } from "./rightPanelSize"

// Design v3 (shell V1): the right panel is 452px by default, never under
// 360px and never over 60% of the group. The group sizes in percent, so the
// pixels are turned into its percentages.

const px = (percent: number, width: number) => (percent / 100) * width

describe("the right panel's size", () => {
  it("opens at 452px wherever that fits", () => {
    for (const width of [1100, 1200, 1400, 1800]) {
      const opened = px(rightPanelDefaultSize(width), width)
      expect(opened, `${width}`).toBeGreaterThanOrEqual(RIGHT_PANEL_DEFAULT_PX)
      expect(opened, `${width}`).toBeLessThan(RIGHT_PANEL_DEFAULT_PX + 2)
    }
  })

  it("is never laid out under 360px, up to 60% of a narrow group", () => {
    for (const width of [700, 845, 1000]) {
      expect(px(rightPanelMinSize(width), width), `${width}`).toBeGreaterThanOrEqual(RIGHT_PANEL_MIN_PX)
    }
    expect(rightPanelMinSize(400)).toBe(60)
    expect(rightPanelDefaultSize(400)).toBe(60)
  })

  it("has a sensible size before the group is measured", () => {
    expect(rightPanelMinSize(0)).toBe(32)
    expect(rightPanelMinSize(Number.NaN)).toBe(32)
    expect(rightPanelDefaultSize(0)).toBe(32)
  })
})

// Chat C36: a thread opens at 420px and is resizable from 360 to 560px.

describe("a thread's panel", () => {
  it("is a thread for a message's replies, and not for a task or the AI", () => {
    expect(rightPanelKind({ channelUUID: "c", postUUID: "p" })).toBe("thread")
    expect(rightPanelKind({ chatUUID: "c", chatMessageUUID: "m" })).toBe("thread")
    expect(rightPanelKind({ groupUUID: "g", chatMessageUUID: "m" })).toBe("thread")
    expect(rightPanelKind({ channelUUID: "c", postUUID: "p", aiChatOpen: true })).toBe("default")
    expect(rightPanelKind({})).toBe("default")
  })

  it("opens at 420px and stops at 560px, never under 360", () => {
    for (const width of [1200, 1400, 1800]) {
      const opened = px(rightPanelOpenSize(width, "thread"), width)
      expect(opened, `${width}`).toBeGreaterThanOrEqual(THREAD_PANEL_DEFAULT_PX)
      expect(opened, `${width}`).toBeLessThan(THREAD_PANEL_DEFAULT_PX + 2)
      expect(px(rightPanelMaxSize(width, "thread"), width), `${width}`).toBeLessThanOrEqual(THREAD_PANEL_MAX_PX)
      expect(px(rightPanelMaxSize(width, "thread"), width), `${width}`).toBeGreaterThan(THREAD_PANEL_MAX_PX - 2)
    }
    // A narrow group: the minimum wins over the cap.
    expect(px(rightPanelMaxSize(700, "thread"), 700)).toBeGreaterThanOrEqual(RIGHT_PANEL_MIN_PX)
    expect(rightPanelMaxSize(1400)).toBe(60)
  })
})
