import { describe, expect, it } from "vitest"
import { MAX_RECENT_COLOURS, RECENT_COLOURS_KEY, recentColoursOf, withRecentColour } from "@/lib/calendar/recentColours"

// "Your colours" (calendar head B): the reader's own colours, newest first, each once, the oldest past twelve dropped.
describe("your colours", () => {
  it("puts the newest first, each colour once, and keeps twelve", () => {
    expect(withRecentColour(["#111111", "#222222"], "#333333")).toEqual(["#333333", "#111111", "#222222"])
    expect(withRecentColour(["#111111", "#222222", "#333333"], "#222222")).toEqual(["#222222", "#111111", "#333333"])
    const twelve = Array.from({ length: 12 }, (_, i) => `#0000${String(i).padStart(2, "0")}`)
    const next = withRecentColour(twelve, "#abcdef")
    expect(next).toHaveLength(MAX_RECENT_COLOURS)
    expect(next[0]).toBe("#abcdef")
    expect(next).not.toContain("#000011")
    expect(withRecentColour([], "#ABCDEF")).toEqual(["#abcdef"])
  })

  it("reads them from the preferences under their one key, dropping what isn't a colour", () => {
    expect(RECENT_COLOURS_KEY).toBe("calendar.recent_colours")
    expect(recentColoursOf({ "calendar.recent_colours": ["#3b7ddd", "sky", 4, "#10b981"] })).toEqual(["#3b7ddd", "#10b981"])
    expect(recentColoursOf({ "calendar.recent_colours": "nope" })).toEqual([])
    expect(recentColoursOf(undefined)).toEqual([])
  })
})
