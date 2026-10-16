import { describe, expect, it } from "vitest"
import { dateChoices, reminderTime } from "./parseDate"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// The days a query after "@" names (small-details D4), day before month and
// weeks from Monday as everywhere in the app (D9), on Wednesday 14 Oct 2026.
const WED = new Date(2026, 9, 14, 10, 30)
const days = (q: string) => dateChoices(q, WED).map((c) => c.date)
const labels = (q: string) => dateChoices(q, WED).map((c) => c.label)

describe("the days an @ query names", () => {
  it("knows today, tomorrow and yesterday from three letters", () => {
    expect(days("tod")).toEqual(["2026-10-14"])
    expect(days("tom")).toEqual(["2026-10-15"])
    expect(days("tmrw")).toEqual(["2026-10-15"])
    expect(days("yes")).toEqual(["2026-10-13"])
    expect(labels("tomorrow")).toEqual(["Tomorrow"])
  })

  it("names no day from fewer letters, so a name like Fr… stays a person", () => {
    expect(days("to")).toEqual([])
    expect(days("fr")).toEqual([])
    expect(days("sam")).toEqual([])
  })

  it("takes a weekday as the calendar's quick create does: the coming one, a week out when it is today", () => {
    expect(days("fri")).toEqual(["2026-10-16"])
    expect(days("next fri")).toEqual(["2026-10-16"])
    expect(days("wednesday")).toEqual(["2026-10-21"])
    expect(days("mon")).toEqual(["2026-10-19"])
    expect(days("next mon")).toEqual(["2026-10-19"])
    expect(labels("next friday")).toEqual(["Friday"])
  })

  it("takes next week from the app's first day of the week", () => {
    expect(days("next week")).toEqual(["2026-10-19"])
    expect(labels("next week")).toEqual(["Next week"])
  })

  it("reads a date with the day before the month, as the app writes one", () => {
    expect(days("12 oct")).toEqual(["2026-10-12"])
    expect(days("12th October")).toEqual(["2026-10-12"])
    expect(days("oct 12")).toEqual(["2026-10-12"])
    expect(days("12/10")).toEqual(["2026-10-12"])
    expect(days("3/1/27")).toEqual(["2027-01-03"])
    expect(days("2026-12-25")).toEqual(["2026-12-25"])
    expect(labels("12 oct")).toEqual(["12 Oct"])
  })

  it("reads days and weeks from now", () => {
    expect(days("in 3 days")).toEqual(["2026-10-17"])
    expect(days("in 2 weeks")).toEqual(["2026-10-28"])
    expect(labels("in 1 week")).toEqual(["In 1 week"])
  })

  it("names no day that doesn't exist", () => {
    expect(days("31/2")).toEqual([])
    expect(days("2026-13-01")).toEqual([])
  })

  it("says each day in full beside its name", () => {
    expect(dateChoices("tom", WED)[0]).toEqual({ date: "2026-10-15", label: "Tomorrow", detail: "Thu 15 Oct" })
    expect(dateChoices("3/1/27", WED)[0].detail).toBe("Sun 3 Jan 2027")
  })
})

describe("when a reminder on a day comes", () => {
  it("is nine that morning, the next whole hour on a day already past nine, and never for a day gone by", () => {
    expect(reminderTime("2026-10-15", WED)).toEqual(new Date(2026, 9, 15, 9))
    expect(reminderTime("2026-10-14", WED)).toEqual(new Date(2026, 9, 14, 11))
    expect(reminderTime("2026-10-14", new Date(2026, 9, 14, 8))).toEqual(new Date(2026, 9, 14, 9))
    expect(reminderTime("2026-10-13", WED)).toBeNull()
    expect(reminderTime("2026-10-14", new Date(2026, 9, 14, 23, 30))).toBeNull()
  })
})
