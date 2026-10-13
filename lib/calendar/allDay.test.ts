import { afterEach, describe, expect, it } from "vitest"
import { localDate, placeAllByDates, placedByDates } from "./allDay"

// CAL-BUG-2: a Google all-day event comes with its dates and placeholder
// instants at 12:00 UTC. Each test runs in the zones that showed the bug
// (New York and India read the old midnight-UTC instants as two days) and in
// Auckland, where 12:00 UTC on the 14th is 01:00 on the 15th.
const ZONES = ["America/New_York", "Asia/Kolkata", "Pacific/Auckland"]
const original = process.env.TZ
afterEach(() => {
  if (original === undefined) delete process.env.TZ
  else process.env.TZ = original
})

const offsite = (extra: Record<string, unknown> = {}) => ({
  event_uuid: "gcal-offsite",
  event_title: "Offsite",
  event_start_time: "2026-10-14T12:00:00Z",
  event_end_time: "2026-10-14T12:00:00Z",
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
    const e = placedByDates(offsite({ event_end_time: "2026-10-16T12:00:00Z", event_end_date: "2026-10-17" }))
    expect(e.event_start_time).toBe(new Date(2026, 9, 14).toISOString())
    expect(e.event_end_time).toBe(new Date(2026, 9, 17).toISOString())
  })

  it("falls back on the placeholders' days when the dates are missing", () => {
    process.env.TZ = "Pacific/Auckland"
    // The first day at 12:00 UTC and the last day at 12:00 UTC: 14 to 16 October.
    const e = placedByDates(offsite({ event_start_date: undefined, event_end_date: undefined, event_end_time: "2026-10-16T12:00:00Z" }))
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
