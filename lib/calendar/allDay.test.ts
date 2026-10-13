import { afterEach, describe, expect, it } from "vitest"
import { allDayLastDay, localDate, placeAllByDates, placedByDates } from "./allDay"

// CAL-BUG-2: a Google all-day event comes with its dates, and instants at
// midnight UTC on its first day and the day after its last, which New York,
// India and Auckland each read as two days. Each test runs in those zones.
const ZONES = ["America/New_York", "Asia/Kolkata", "Pacific/Auckland"]
const original = process.env.TZ
afterEach(() => {
  if (original === undefined) delete process.env.TZ
  else process.env.TZ = original
})

const offsite = (extra: Record<string, unknown> = {}) => ({
  event_uuid: "gcal-offsite",
  event_title: "Offsite",
  event_start_time: "2026-10-14T00:00:00Z",
  event_end_time: "2026-10-15T00:00:00Z",
  event_all_day: true,
  event_start_date: "2026-10-14",
  event_end_date: "2026-10-15",
  ...extra,
})

describe("a Google all-day event", () => {
  for (const zone of ZONES) {
    it(`sits at the reader's midnights, the end exclusive, in ${zone}`, () => {
      process.env.TZ = zone
      const e = placedByDates(offsite())
      expect(e.event_start_time).toBe(new Date(2026, 9, 14).toISOString())
      expect(e.event_end_time).toBe(new Date(2026, 9, 15).toISOString())
      expect(new Date(e.event_start_time).getDate()).toBe(14)
    })
  }

  it("covers each of its days, and no more, when it runs for several", () => {
    process.env.TZ = "Pacific/Auckland"
    const e = placedByDates(offsite({ event_end_time: "2026-10-17T00:00:00Z", event_end_date: "2026-10-17" }))
    expect(e.event_start_time).toBe(new Date(2026, 9, 14).toISOString())
    expect(e.event_end_time).toBe(new Date(2026, 9, 17).toISOString())
  })

  it("falls back on the instants' UTC dates when the dates are missing", () => {
    process.env.TZ = "Pacific/Auckland"
    // Midnight UTC on the first day and on the day after the last: 14 to 16 October.
    const e = placedByDates(offsite({ event_start_date: undefined, event_end_date: undefined, event_end_time: "2026-10-17T00:00:00Z" }))
    expect(e.event_start_time).toBe(new Date(2026, 9, 14).toISOString())
    expect(e.event_end_time).toBe(new Date(2026, 9, 17).toISOString())
  })

  it("is never shorter than its first day", () => {
    process.env.TZ = "Asia/Kolkata"
    const e = placedByDates(offsite({ event_end_date: "2026-10-14" }))
    expect(e.event_end_time).toBe(new Date(2026, 9, 15).toISOString())
  })

  it("holds its day where that day has no midnight (Chile's clocks skip 00:00 on 6 September)", () => {
    process.env.TZ = "America/Santiago"
    const e = placedByDates(offsite({ event_start_date: "2026-09-06", event_end_date: "2026-09-07" }))
    expect(new Date(e.event_start_time).getDate()).toBe(6)
    expect(new Date(e.event_end_time).getDate()).toBe(7)
  })
})

describe("anything else", () => {
  it("is left as it came, the same object", () => {
    const timed = { event_uuid: "e1", event_title: "Standup", event_start_time: "2026-10-14T09:00:00Z", event_end_time: "2026-10-14T09:30:00Z" }
    expect(placedByDates(timed)).toBe(timed)
    const list = [timed]
    expect(placeAllByDates(list)).toBe(list)
  })

  it("reads only real dates", () => {
    expect(localDate("2026-02-30")).toBeNull()
    expect(localDate("14/10/2026")).toBeNull()
    expect(localDate(undefined)).toBeNull()
    expect(localDate("2026-10-14")?.getDate()).toBe(14)
  })
})

// One way to count an all-day item's last day, for every view (audit).
describe("an all-day item's last day", () => {
  it("is the day before its end, in days, and never before its first", () => {
    process.env.TZ = "America/New_York"
    // 1 November 2026 is 25 hours long there.
    expect(allDayLastDay(new Date(2026, 10, 1), new Date(2026, 10, 2)).getDate()).toBe(1)
    expect(allDayLastDay(new Date(2026, 9, 14), new Date(2026, 9, 17)).getDate()).toBe(16)
    expect(allDayLastDay(new Date(2026, 9, 14), new Date(2026, 9, 14)).getDate()).toBe(14)
    process.env.TZ = "America/Santiago"
    // 6 September 2026 starts at 01:00 there.
    expect(allDayLastDay(new Date(2026, 8, 6), new Date(2026, 8, 7)).getDate()).toBe(6)
  })
})

