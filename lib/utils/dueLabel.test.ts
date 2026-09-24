import { describe, expect, it } from "vitest"
import { dueLabel } from "./dueLabel"

// Local dates, so the expectations hold in any zone the tests run in.
const at = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m)

describe("dueLabel", () => {
  const now = at(24, 12)
  it("says today and tomorrow with the time, later days without", () => {
    expect(dueLabel(at(24, 17).toISOString(), now)).toBe("Due today, 5:00 PM")
    expect(dueLabel(at(25, 9).toISOString(), now)).toBe("Due tomorrow, 9:00 AM")
    expect(dueLabel(at(30, 9).toISOString(), now)).toBe("Due Sep 30")
  })
  it("says a missed moment as was due", () => {
    expect(dueLabel(at(24, 9).toISOString(), now)).toBe("Was due 9:00 AM")
    expect(dueLabel(at(2, 9).toISOString(), now)).toBe("Was due Sep 2")
  })
  it("is empty for nothing it can read, so the caller falls back", () => {
    expect(dueLabel(undefined, now)).toBe("")
    expect(dueLabel("not a date", now)).toBe("")
  })
})
