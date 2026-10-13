import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { CalendarEventInterface } from "@/types/calendar"
import { itemsByDay, layoutWeek, placeItems } from "./calendarLayout"
import { WeekView } from "./weekView"
import { EventPopover } from "./eventPopover"
import { CalendarAgenda } from "./calendarAgenda"
import { isAllDay as homeAllDay, planAgenda } from "@/components/home/homeTime"
import { placedByDates } from "@/lib/calendar/allDay"

// CAL-BUG-2: "Offsite", a Google all-day event on Wednesday 14 October, sat
// on two days for everyone outside UTC, with clock times. It comes with its
// dates and placeholder instants at 12:00 UTC; every view places it by the
// dates. Auckland reads 12:00 UTC on the 14th as 01:00 on the 15th, so an
// instant there lands on the wrong day.
const ZONES = ["America/New_York", "Asia/Kolkata", "Pacific/Auckland"]
const original = process.env.TZ
afterEach(() => {
  cleanup()
  if (original === undefined) delete process.env.TZ
  else process.env.TZ = original
})

const offsite = (extra: Partial<CalendarEventInterface> = {}): CalendarEventInterface => ({
  event_uuid: "gcal-offsite",
  event_title: "Offsite",
  event_start_time: "2026-10-14T12:00:00Z",
  event_end_time: "2026-10-14T12:00:00Z",
  event_all_day: true,
  event_start_date: "2026-10-14",
  event_end_date: "2026-10-15",
  ...extra,
})

const daysWith = (byDay: Map<string, { event_uuid: string }[]>, uuid: string) =>
  [...byDay.entries()].filter(([, items]) => items.some((i) => i.event_uuid === uuid)).map(([k]) => k)

for (const zone of ZONES) {
  describe(`a Google all-day event in ${zone}`, () => {
    it("is on its own date only, once, and never a timed bar", () => {
      process.env.TZ = zone
      const placed = placeItems([offsite()])
      const byDay = itemsByDay(placed, new Date(2026, 9, 1), new Date(2026, 9, 31))
      expect(daysWith(byDay, "gcal-offsite")).toEqual(["2026-10-14"])
      expect(byDay.get("2026-10-14")?.filter((i) => i.event_uuid === "gcal-offsite")).toHaveLength(1)
      // The week of Monday 12 October: Wednesday's column, one day, a full bar.
      const [[bar]] = layoutWeek(new Date(2026, 9, 12), placed)
      expect(bar).toMatchObject({ col: 2, span: 1, timed: false })
    })

    it("covers each of its days when it runs for several", () => {
      process.env.TZ = zone
      const byDay = itemsByDay(placeItems([offsite({ event_end_time: "2026-10-16T12:00:00Z", event_end_date: "2026-10-17" })]), new Date(2026, 9, 1), new Date(2026, 9, 31))
      expect(daysWith(byDay, "gcal-offsite")).toEqual(["2026-10-14", "2026-10-15", "2026-10-16"])
    })

    it("sits in the week's all-day rail on Wednesday, and nowhere in the grid", () => {
      process.env.TZ = zone
      render(<WeekView weekStart={new Date(2026, 9, 12)} events={[offsite()]} tasks={[]} showEvents showTasks onEventClick={vi.fn()} onTaskClick={vi.fn()} />)
      const rail = document.querySelector("[data-all-day-rail]") as HTMLElement
      const columns = Array.from(rail.children).slice(1)
      expect(columns.map((c) => (c.textContent?.includes("Offsite") ? 1 : 0))).toEqual([0, 0, 1, 0, 0, 0, 0])
      expect(screen.getAllByRole("button", { name: /Offsite/ })).toHaveLength(1)
    })

    it("reads All day in its popover, and in the agenda", () => {
      process.env.TZ = zone
      const anchor = document.createElement("button")
      document.body.appendChild(anchor)
      render(<EventPopover event={offsite()} anchor={anchor} now={new Date(2026, 9, 13, 9)} onClose={vi.fn()} onOpenFull={vi.fn()} />)
      expect(screen.getByRole("dialog", { name: "Offsite" }).textContent).toContain("Wed 14 Oct · All day")
      cleanup()
      const [placed] = placeItems([offsite()])
      render(<CalendarAgenda desktop days={[{ day: new Date(2026, 9, 14), items: [placed.item] }]} onOpen={vi.fn()} now={new Date(2026, 9, 13, 9)} />)
      expect(screen.getByRole("button", { name: /Offsite/ }).textContent).toContain("All day")
    })

    it("is an all-day item on Home on its date, and not on the next day", () => {
      process.env.TZ = zone
      const e = placedByDates(offsite())
      const plan = planAgenda([e], new Date(2026, 9, 14, 10))
      expect(plan.allDay.map((x) => x.event_uuid)).toEqual(["gcal-offsite"])
      expect(plan.rows).toEqual([])
      expect(homeAllDay(e, new Date(2026, 9, 15, 10))).toBe(false)
    })
  })
}

describe("a Google all-day event on a day without a midnight", () => {
  it("still reads All day, on its own date (Chile skips 00:00 on 6 September 2026)", () => {
    process.env.TZ = "America/Santiago"
    const e = offsite({ event_start_time: "2026-09-06T12:00:00Z", event_end_time: "2026-09-06T12:00:00Z", event_start_date: "2026-09-06", event_end_date: "2026-09-07" })
    const byDay = itemsByDay(placeItems([e]), new Date(2026, 8, 1), new Date(2026, 8, 30))
    expect(daysWith(byDay, "gcal-offsite")).toEqual(["2026-09-06"])
    const anchor = document.createElement("button")
    document.body.appendChild(anchor)
    render(<EventPopover event={e} anchor={anchor} now={new Date(2026, 8, 5, 9)} onClose={vi.fn()} onOpenFull={vi.fn()} />)
    expect(screen.getByRole("dialog", { name: "Offsite" }).textContent).toContain("Sun 6 Sep · All day")
  })
})

describe("a one-day all-day event of OneCamp's own in the month", () => {
  it("is a full bar without a time, as Google's is", () => {
    const placed = placeItems([{ event_uuid: "a", event_title: "Launch", event_start_time: new Date(2026, 9, 16).toISOString(), event_end_time: new Date(2026, 9, 17).toISOString() }])
    const [[bar]] = layoutWeek(new Date(2026, 9, 12), placed)
    expect(bar.timed).toBe(false)
  })
})
