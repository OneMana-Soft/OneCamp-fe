import { describe, expect, it } from "vitest"
import { messageLink, reminderChoices, reminderLabel, toLocalInput } from "./later"

// Local-time constructors: the choices are about the person's own clock.
const d = (y: number, m: number, day: number, h = 0, min = 0) => new Date(y, m - 1, day, h, min)

describe("reminderChoices", () => {
  it("on a Wednesday morning offers an hour, this evening, tomorrow at 9 and Monday at 9", () => {
    const now = d(2026, 9, 30, 10, 17) // Wednesday
    const c = reminderChoices(now)
    expect(c.map((x) => x.key)).toEqual(["hour", "evening", "tomorrow", "week"])
    expect(c[0].at).toEqual(d(2026, 9, 30, 11, 17))
    expect(c[1].at).toEqual(d(2026, 9, 30, 18))
    expect(c[2].at).toEqual(d(2026, 10, 1, 9))
    expect(c[3].at).toEqual(d(2026, 10, 5, 9)) // Monday
  })

  it("drops 'this evening' once the evening is near or past", () => {
    expect(reminderChoices(d(2026, 9, 30, 16, 30)).map((x) => x.key)).not.toContain("evening")
    expect(reminderChoices(d(2026, 9, 30, 21)).map((x) => x.key)).not.toContain("evening")
  })

  it("on a Monday, next week is the following Monday", () => {
    const week = reminderChoices(d(2026, 9, 28, 10)).find((x) => x.key === "week")!
    expect(week.at).toEqual(d(2026, 10, 5, 9))
  })

  it("on a Sunday it does not offer tomorrow twice", () => {
    const keys = reminderChoices(d(2026, 10, 4, 10)).map((x) => x.key)
    expect(keys).toContain("tomorrow")
    expect(keys).not.toContain("week")
  })

  it("every choice is in the future", () => {
    for (let h = 0; h < 24; h++) {
      const now = d(2026, 9, 30, h, 59)
      for (const c of reminderChoices(now)) expect(c.at.getTime()).toBeGreaterThan(now.getTime())
    }
  })
})

describe("reminderLabel", () => {
  const now = d(2026, 9, 30, 10)
  it("says Due once the time has come", () => {
    expect(reminderLabel(d(2026, 9, 30, 9), now)).toEqual({ text: "Due", due: true })
  })
  it("names today, tomorrow, the weekday, then the date", () => {
    // In the app's one format, whatever the browser's locale.
    expect(reminderLabel(d(2026, 9, 30, 15), now).text).toBe("Today, 3:00 PM")
    expect(reminderLabel(d(2026, 10, 1, 9), now).text).toBe("Tomorrow, 9:00 AM")
    expect(reminderLabel(d(2026, 10, 5, 9), now).text).toBe("Mon, 9:00 AM")
    expect(reminderLabel(d(2026, 10, 20, 9), now).text).toBe("20 Oct")
    expect(reminderLabel(d(2027, 1, 20, 9), now).text).toBe("20 Jan 2027")
  })
})

describe("messageLink", () => {
  it("opens a channel message in its thread", () => {
    expect(messageLink({ channelUUID: "c1", postUUID: "p1" })).toBe("/app/channel/c1/p1")
  })
  it("opens a direct or group message", () => {
    expect(messageLink({ chatUUID: "u2", chatMessageID: "m1" })).toBe("/app/chat/u2/m1")
    expect(messageLink({ groupUUID: "g1", chatMessageID: "m1" })).toBe("/app/chat/group/g1/m1")
  })
  it("gives nothing when it cannot say where the message is", () => {
    expect(messageLink({ postUUID: "p1" })).toBeNull()
  })
})

describe("toLocalInput", () => {
  it("formats for datetime-local in local time", () => {
    expect(toLocalInput(d(2026, 1, 5, 7, 3))).toBe("2026-01-05T07:03")
  })
})
