import { describe, expect, it } from "vitest"
import { youStatusLine } from "./youStatusLine"

describe("the line under your name", () => {
  const soon = new Date(Date.now() + 60 * 60_000)
  it("says focus first, then a pause, then your status, else Active", () => {
    expect(youStatusLine({ focusUntil: soon, pausedUntil: soon, text: "Shipping" })).toMatch(/^In focus until /)
    expect(youStatusLine({ focusUntil: null, pausedUntil: soon, text: "Shipping" })).toMatch(/^Notifications paused until /)
    expect(youStatusLine({ focusUntil: null, pausedUntil: null, emoji: "🎯", text: " Shipping the Q4 launch " })).toBe("🎯 Shipping the Q4 launch")
    expect(youStatusLine({ focusUntil: null, pausedUntil: null })).toBe("Active")
  })
})
