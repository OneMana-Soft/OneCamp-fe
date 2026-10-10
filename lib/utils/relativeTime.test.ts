import { describe, expect, it } from "vitest"
import { daysAgo, relativeTime } from "./relativeTime"

// Past the recent range, both fall back to the app's one date format ("9 Oct",
// the year only when it isn't this one), not the browser's locale.
const now = new Date(2026, 9, 10, 12).getTime()
const ago = (days: number) => new Date(now - days * 86_400_000).toISOString()

describe("relativeTime", () => {
  it("counts recent times, then gives the day", () => {
    expect(relativeTime(ago(0), now)).toBe("just now")
    expect(relativeTime(ago(2), now)).toBe("2d ago")
    expect(relativeTime(ago(9), now)).toBe("1 Oct")
    expect(relativeTime(ago(300), now)).toBe("14 Dec 2025")
  })
})

describe("daysAgo", () => {
  it("counts days and weeks, then gives the day", () => {
    expect(daysAgo(ago(3), now)).toBe("3 days ago")
    expect(daysAgo(ago(20), now)).toBe("2 weeks ago")
    expect(daysAgo(ago(70), now)).toBe("1 Aug")
    expect(daysAgo(ago(300), now)).toBe("14 Dec 2025")
  })
})
