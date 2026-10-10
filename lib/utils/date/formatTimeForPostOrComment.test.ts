import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  formatFullTimestamp,
  formatGutterClock,
  formatListTimestamp,
  formatTimeForPostOrComment,
} from "./formatTimeForPostOrComment"
import { getGroupDateHeading } from "./getMessageGroupDate"
import { formatDateForAttachment } from "./formatDateforAttachment"
import { formatTimeForReplyCount } from "./formatTimeForReplyCount"

// Messages, lists and their tooltips in the app's one format: "9 Oct", the
// year only when it isn't this one, and "3:10 PM". Local times throughout, so
// the expectations hold in any zone the tests run in.

const at = (y: number, m: number, d: number, h = 15, min = 10) => new Date(y, m - 1, d, h, min).toISOString()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(2026, 9, 10, 16, 0))
})
afterEach(() => vi.useRealTimers())

describe("a message's time", () => {
  it("is the clock today, Yesterday and the clock, then the day and the clock", () => {
    expect(formatTimeForPostOrComment(at(2026, 10, 10))).toBe("3:10 PM")
    expect(formatTimeForPostOrComment(at(2026, 10, 9))).toBe("Yesterday 3:10 PM")
    expect(formatTimeForPostOrComment(at(2026, 10, 7))).toBe("7 Oct, 3:10 PM")
    expect(formatTimeForPostOrComment(at(2025, 12, 30))).toBe("30 Dec 2025, 3:10 PM")
  })

  it("keeps its AM or PM beside a message that continues the one above", () => {
    expect(formatGutterClock(at(2026, 10, 10))).toBe("3:10 PM")
    expect(formatGutterClock(at(2026, 10, 10, 9, 5))).toBe("9:05 AM")
  })

  it("has the full date in its tooltip", () => {
    expect(formatFullTimestamp(at(2026, 10, 9))).toBe("Friday 9 October 2026, 3:10 PM")
  })

  it("is nothing for a date that can't be read", () => {
    expect(formatTimeForPostOrComment("not a date")).toBe("")
    expect(formatGutterClock("not a date")).toBe("")
  })
})

describe("a list's time column (channels, DMs, activity)", () => {
  it("is the clock today, Yesterday, then the day", () => {
    expect(formatListTimestamp(at(2026, 10, 10))).toBe("3:10 PM")
    expect(formatListTimestamp(at(2026, 10, 9))).toBe("Yesterday")
    expect(formatListTimestamp(at(2026, 10, 7))).toBe("7 Oct")
    expect(formatListTimestamp(at(2025, 12, 30))).toBe("30 Dec 2025")
  })
})

describe("the rest of a conversation's dates", () => {
  it("heads a day's messages with its weekday and day", () => {
    expect(getGroupDateHeading(new Date(2026, 9, 10).toISOString())).toBe("Today")
    expect(getGroupDateHeading(new Date(2026, 9, 9).toISOString())).toBe("Yesterday")
    expect(getGroupDateHeading(new Date(2026, 9, 7).toISOString())).toBe("Wednesday 7 Oct")
    expect(getGroupDateHeading(new Date(2025, 11, 30).toISOString())).toBe("Tuesday 30 Dec 2025")
  })

  it("dates an attachment and a thread's last reply the same way", () => {
    expect(formatDateForAttachment(at(2026, 10, 7))).toBe("7 Oct")
    expect(formatDateForAttachment(at(2025, 12, 30))).toBe("30 Dec 2025")
    expect(formatTimeForReplyCount(at(2026, 10, 10))).toBe("Today at 3:10 PM")
  })
})
