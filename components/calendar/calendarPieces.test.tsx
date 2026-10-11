import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { addDays } from "date-fns"

vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn().mockResolvedValue({}), isSubmitting: false }) }))

import { MonthView } from "./monthView"
import { EventPopover, joinLinkOf, whenLabel } from "./eventPopover"
import { QuickCreateCard } from "./quickCreateCard"
import { CalendarsPanel } from "./calendarsPopover"
import { CalendarAgenda, nextItemId } from "./calendarAgenda"
import { itemsByDay, layoutWeek, monthGridRange, placeItems } from "./calendarLayout"

afterEach(cleanup)

const now = new Date(2026, 9, 15, 10, 0) // Thu 15 Oct
const iso = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString()

function month(items: Parameters<typeof placeItems>[0]) {
  const { start, end } = monthGridRange(now)
  const placed = placeItems(items)
  const weeks = []
  for (let ws = start; ws <= end; ws = addDays(ws, 7)) weeks.push({ weekStart: ws, days: Array.from({ length: 7 }, (_, i) => addDays(ws, i)), tracks: layoutWeek(ws, placed) })
  return render(<MonthView month={now} weeks={weeks} byDay={itemsByDay(placed, start, end)} now={now} onItemClick={vi.fn()} onDraft={vi.fn()} />)
}

describe("the month (C05, C06)", () => {
  it("marks today with a ring, weekends as sunken, and starts on Monday", () => {
    month([])
    const today = document.querySelector("[data-month-day][data-today]") as HTMLElement
    expect(today.querySelector("[aria-current=date]")?.className).toMatch(/ring-brand/)
    expect(document.querySelector("[data-month-day][data-weekend]")?.className).toMatch(/bg-sunken/)
    expect(new Date((document.querySelector("[data-month-day]") as HTMLElement).dataset.monthDay!).getDay()).toBe(1)
  })

  it("draws a timed event as a quiet bar and an all-day one full", () => {
    month([
      { event_uuid: "t", event_title: "Standup", event_start_time: iso(15, 9), event_end_time: iso(15, 10) },
      { event_uuid: "a", event_title: "Launch", event_start_time: iso(16, 0), event_end_time: iso(17, 0) },
    ])
    expect(document.querySelector('[data-event-uuid="t"]')?.className).toMatch(/\[--fill:35%\]/)
    expect(document.querySelector('[data-event-uuid="a"]')?.className).toMatch(/\[--fill:60%\]/)
  })

  it("lists what doesn't fit behind +N more", () => {
    month([1, 2, 3, 4, 5].map((i) => ({ event_uuid: `m${i}`, event_title: `M${i}`, event_start_time: iso(15, 8 + i), event_end_time: iso(15, 9 + i) })))
    expect(screen.getByRole("button", { name: "+2 more" })).toBeTruthy()
  })
})

describe("the event popover (C12)", () => {
  const ev = { event_uuid: "e1", event_title: "Design review", event_start_time: iso(15, 11), event_end_time: iso(15, 12), event_description: "<p>Join https://meet.example.com/abc</p>" }

  it("is a dialog named by its title, with the time, how soon, and a call to join", () => {
    const anchor = document.createElement("button")
    document.body.appendChild(anchor)
    render(<EventPopover event={ev} anchor={anchor} now={now} onClose={vi.fn()} onOpenFull={vi.fn()} />)
    const dialog = screen.getByRole("dialog", { name: "Design review" })
    expect(dialog.className).toMatch(/w-\[360px\]/)
    expect(dialog.textContent).toMatch(/Thu 15 Oct · 11:00 AM – 12:00 PM/)
    expect(dialog.textContent).toMatch(/in 1 hour/)
    expect(screen.getByRole("link", { name: /Join call/ }).getAttribute("href")).toBe("https://meet.example.com/abc")
  })

  it("opens the full panel from the pencil", () => {
    const anchor = document.createElement("button")
    document.body.appendChild(anchor)
    const full = vi.fn()
    render(<EventPopover event={ev} anchor={anchor} now={now} onClose={vi.fn()} onOpenFull={full} />)
    fireEvent.click(screen.getByRole("button", { name: "Edit event" }))
    expect(full).toHaveBeenCalledWith("e1")
  })

  it("finds the call link and says now and ended", () => {
    expect(joinLinkOf({ event_description: "no link" })).toBeNull()
    expect(whenLabel(new Date(2026, 9, 15, 9), new Date(2026, 9, 15, 11), now).text).toBe("now")
    expect(whenLabel(new Date(2026, 9, 15, 8), new Date(2026, 9, 15, 9), now).text).toBe("ended")
  })
})

describe("quick create (C14)", () => {
  it("reads the title as it's typed and moves the draft", () => {
    const anchor = document.createElement("div")
    document.body.appendChild(anchor)
    const change = vi.fn()
    render(<QuickCreateCard draft={{ start: new Date(2026, 9, 15, 9), end: new Date(2026, 9, 15, 9, 30) }} anchor={anchor} onDraftChange={change} onClose={vi.fn()} onCreated={vi.fn()} onMoreOptions={vi.fn()} />)
    fireEvent.change(screen.getByLabelText("Event title"), { target: { value: "Lunch at 1pm for 45m" } })
    expect(change).toHaveBeenLastCalledWith({ start: new Date(2026, 9, 15, 13, 0), end: new Date(2026, 9, 15, 13, 45) })
    expect(screen.getByRole("button", { name: /Focus/ }).getAttribute("aria-pressed")).toBe("false")
    expect(screen.getByRole("button", { name: "More options" })).toBeTruthy()
  })
})

describe("the calendars popover (C01, C04, C19)", () => {
  it("holds the mini month, the calendars with colour checkboxes, booking pages and Google", () => {
    const toggle = vi.fn()
    render(
      <CalendarsPanel
        anchor={now}
        view="week"
        hasItems={() => false}
        onPick={vi.fn()}
        rows={[{ id: "onecamp", name: "Personal", hue: "sky", on: true, onToggle: toggle }]}
        onBookingPages={vi.fn()}
        googleConnected={false}
        onConnectGoogle={vi.fn()}
        onDisconnectGoogle={vi.fn()}
      />,
    )
    expect(document.querySelector("[data-mini-month]")).toBeTruthy()
    expect(document.querySelector("[data-range-band]")).toBeTruthy()
    const box = screen.getByRole("checkbox", { name: "Personal" })
    expect(box.getAttribute("aria-checked")).toBe("true")
    fireEvent.click(box)
    expect(toggle).toHaveBeenCalled()
    expect(screen.getByRole("button", { name: /Booking pages/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Connect Google Calendar/ })).toBeTruthy()
  })
})

describe("the agenda (C17)", () => {
  const items = [
    { event_uuid: "past", event_title: "Standup", event_start_time: iso(15, 8), event_end_time: iso(15, 9) },
    { event_uuid: "next", event_title: "Design review", event_start_time: iso(15, 11), event_end_time: iso(15, 12) },
  ]
  it("marks the next event", () => {
    expect(nextItemId([{ day: new Date(2026, 9, 15), items }], now)).toBe("next")
    render(<CalendarAgenda desktop days={[{ day: new Date(2026, 9, 15), items }]} onOpen={vi.fn()} now={now} />)
    const row = document.querySelector("[data-next]") as HTMLElement
    expect(row.textContent).toMatch(/Next · in 60 min.*Design review/)
    expect(document.querySelector("[data-agenda=desktop]")?.className).toMatch(/max-w-\[720px\]/)
  })
})
