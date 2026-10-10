import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { addDays, startOfWeek } from "date-fns"
import type { CalendarEventInterface } from "@/types/calendar"
import { WeekView } from "./weekView"
import { CalendarAgenda } from "./calendarAgenda"

afterEach(cleanup)

const monday = addDays(startOfWeek(new Date(2026, 9, 12)), 1)
const at = (day: number, h: number) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + day, h).toISOString()
const standup: CalendarEventInterface = { event_uuid: "e1", event_title: "Standup", event_start_time: at(1, 9), event_end_time: at(1, 10) }

function week(props: Partial<Parameters<typeof WeekView>[0]> = {}) {
  return render(
    <WeekView
      weekStart={monday}
      events={[]}
      tasks={[]}
      showEvents
      showTasks
      onSlotClick={vi.fn()}
      onEventClick={vi.fn()}
      onTaskClick={vi.fn()}
      {...props}
    />,
  )
}

const blankNote = () => document.querySelector("[data-calendar-blank]")

describe("a week with nothing in it", () => {
  it("says so, small, with the calendar drawing", () => {
    week()
    expect(screen.getByText("Nothing on this week")).toBeTruthy()
    expect(blankNote()?.querySelector("svg.hue-berry")).toBeTruthy()
    // Small: the muted size, not a page's empty state.
    expect(blankNote()?.querySelector("svg")?.getAttribute("width")).toBe("64")
    // The free slots under it still take a click.
    expect(blankNote()?.className).toMatch(/pointer-events-none/)
  })

  it("says nothing while its items are still on their way", () => {
    week({ loading: true })
    expect(blankNote()).toBeNull()
  })

  it("says nothing once anything is on it", () => {
    week({ events: [standup] })
    expect(blankNote()).toBeNull()
  })

  it("names the day in a day view", () => {
    week({ dayCount: 1 })
    expect(screen.getByText("Nothing on this day")).toBeTruthy()
  })
})

describe("the phone's agenda with nothing coming up", () => {
  it("draws the calendar over its words and its one action", () => {
    render(<CalendarAgenda days={[]} onOpen={vi.fn()} onCreate={vi.fn()} />)
    expect(screen.getByRole("heading", { name: "Nothing coming up this month" })).toBeTruthy()
    expect(document.querySelector("[data-empty-illustration] svg.hue-berry")).toBeTruthy()
    expect(screen.getByRole("button", { name: /New event/ })).toBeTruthy()
  })
})

describe("the phone's agenda rows", () => {
  const day = new Date(2026, 9, 12)
  const iso = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString()
  const row = (item: Record<string, unknown>) => {
    render(
      <CalendarAgenda
        days={[{ day, items: [{ event_uuid: "x", event_title: "Item", event_start_time: iso(12, 9), event_end_time: iso(12, 10), ...item } as never] }]}
        onOpen={vi.fn()}
        onCreate={vi.fn()}
      />,
    )
    return screen.getByRole("button", { name: /Item|Focus time|Launch day|Offsite/ }).textContent
  }

  it("says All day for an all-day event, not 12:00 AM to 12:00 AM", () => {
    expect(row({ event_title: "Launch day", event_start_time: iso(12, 0), event_end_time: iso(13, 0) })).toContain("All day")
    cleanup()
    expect(row({ event_title: "Offsite", event_start_time: iso(12, 0), event_end_time: iso(15, 0) })).toContain("All day, until 14 Oct")
  })

  it("does not say Focus time twice for a block called Focus time", () => {
    const text = row({ event_title: "Focus time", event_is_focus: true, event_start_time: iso(12, 13), event_end_time: iso(12, 15) })
    expect(text?.match(/Focus time/g)).toHaveLength(1)
  })
})

