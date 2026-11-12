import { describe, expect, it } from "vitest"
import { TIMED_CHOICES, allDayChoices, customMinutes, customOf, defaultRemindersFor, keepEmail, reminderChoices, reminderWords, remindersLine } from "./reminders"
import { clockTime } from "@/lib/utils/date/clock"

// Calendar A5: an event's reminders in words, as the card's Reminders row
// and its menu say them (STEP4_PLAN §4 #5).
describe("reminders in words", () => {
  it("says a timed event's reminder before its start", () => {
    expect(reminderWords(0, false)).toBe("At the start")
    expect(reminderWords(10, false)).toBe("10 minutes before")
    expect(reminderWords(1, false)).toBe("1 minute before")
    expect(reminderWords(60, false)).toBe("1 hour before")
    expect(reminderWords(120, false)).toBe("2 hours before")
    expect(reminderWords(24 * 60, false)).toBe("1 day before")
    expect(reminderWords(2 * 24 * 60, false)).toBe("2 days before")
    expect(reminderWords(7 * 24 * 60, false)).toBe("1 week before")
    expect(reminderWords(45, false)).toBe("45 minutes before")
  })

  it("says an all-day event's as a day and a time of day, on the reader's clock", () => {
    const nine = clockTime("09:00")
    expect(reminderWords(-540, true)).toBe(`On the day at ${nine}`)
    expect(reminderWords(900, true)).toBe(`The day before at ${nine}`)
    expect(reminderWords(2340, true)).toBe(`2 days before at ${nine}`)
    expect(reminderWords(9540, true)).toBe(`1 week before at ${nine}`)
    expect(reminderWords(-600, true)).toBe(`On the day at ${clockTime("10:00")}`)
    expect(reminderWords(1320, true)).toBe(`The day before at ${clockTime("02:00")}`)
    // The reader's clock, not a fixed one: 9:00 AM in an American browser.
    expect(clockTime("09:00", { locale: "en-US" })).toMatch(/^9:00\sAM$/)
  })

  it("says the first and how many more, or No reminder", () => {
    expect(remindersLine([], false)).toBe("No reminder")
    expect(remindersLine([10], false)).toBe("10 minutes before")
    expect(remindersLine([10, 60], false)).toBe("10 minutes before, +1")
  })

  it("offers the card's choices, and keeps one set elsewhere among them", () => {
    expect(TIMED_CHOICES.map((c) => c.label)).toEqual(["No reminder", "At the start", "5 minutes before", "10 minutes before", "30 minutes before", "1 hour before", "1 day before"])
    expect(allDayChoices().map((c) => c.minutes)).toEqual([null, -540, 900, 2340, 9540])
    expect(reminderChoices([45], false).map((c) => c.label).slice(-1)).toEqual(["45 minutes before"])
    expect(reminderChoices([10], false)).toHaveLength(TIMED_CHOICES.length)
  })
})

// Head A (gcal-5): custom reminders up to four weeks, by email, and a
// calendar's defaults as the server works them out.
describe("custom, by email and per calendar", () => {
  it("writes a custom reminder in its largest whole unit, up to four weeks", () => {
    expect(customOf(90)).toEqual({ count: 90, unit: "minutes" })
    expect(customOf(120)).toEqual({ count: 2, unit: "hours" })
    expect(customOf(3 * 24 * 60)).toEqual({ count: 3, unit: "days" })
    expect(customOf(14 * 24 * 60)).toEqual({ count: 2, unit: "weeks" })
    expect(customOf(0)).toEqual({ count: 0, unit: "minutes" })
    expect(customMinutes(4, "weeks")).toBe(4 * 7 * 24 * 60)
    expect(customMinutes(5, "weeks")).toBeNull()
    expect(customMinutes(1.5, "hours")).toBeNull()
    expect(customMinutes(-1, "minutes")).toBeNull()
    expect(reminderWords(14 * 24 * 60, false)).toBe("2 weeks before")
  })

  it("keeps by email only what is still a reminder, once each, sorted", () => {
    expect(keepEmail([60, 10, 60, 5], [10, 60])).toEqual([10, 60])
    expect(keepEmail(undefined, [10])).toEqual([])
  })

  it("takes the calendar's default, else the reader's own, else D-CAL-4's", () => {
    const all = { mine: { timed: { minutes: [30], email: [30, 99] } }, cal1: { all_day: { minutes: [-540] } } }
    expect(defaultRemindersFor(all, "", false)).toEqual({ minutes: [30], email: [30] })
    expect(defaultRemindersFor(all, "cal2", false)).toEqual({ minutes: [30], email: [30] })
    expect(defaultRemindersFor(all, "cal1", true)).toEqual({ minutes: [-540], email: [] })
    expect(defaultRemindersFor(all, "cal2", true)).toEqual({ minutes: [900], email: [] })
    expect(defaultRemindersFor(null, "", false)).toEqual({ minutes: [10], email: [] })
  })
})
