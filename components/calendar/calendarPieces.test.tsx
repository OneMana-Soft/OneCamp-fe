import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { addDays } from "date-fns"
import type { CalendarEventInterface } from "@/types/calendar"

const sent = vi.hoisted(() => ({ requests: [] as unknown[], confirms: [] as { title: string; onConfirm: () => unknown }[] }))
vi.mock("@/hooks/usePost", () => ({
  usePost: () => ({
    makeRequest: (r: unknown) => {
      sent.requests.push(r)
      return Promise.resolve({})
    },
    isSubmitting: false,
  }),
}))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => (opts: { title: string; onConfirm: () => unknown }) => sent.confirms.push(opts) }))

import { MonthView } from "./monthView"
import { EventPopover, whenLabel } from "./eventPopover"
import { eventCallChoice, eventCallOf, joinLinkOf } from "@/lib/calendar/joinLink"
import { QuickCreateCard } from "./quickCreateCard"
import { CalendarsPanel } from "./calendarsPopover"
import { CalendarAgenda, nextItemId } from "./calendarAgenda"
import { itemsByDay, layoutWeek, monthGridRange, placeItems } from "./calendarLayout"
import { pinTestClock } from "@/lib/testing/testClock"

// Today is TEST_TODAY wherever the code under test reads the time.
pinTestClock()

afterEach(cleanup)

const now = new Date(2026, 9, 15, 10, 0) // Thu 15 Oct
const iso = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString()

function month(items: Parameters<typeof placeItems>[0], on = { onItemClick: vi.fn(), onDraft: vi.fn() }) {
  const { start, end } = monthGridRange(now)
  const placed = placeItems(items)
  const weeks = []
  for (let ws = start; ws <= end; ws = addDays(ws, 7)) weeks.push({ weekStart: ws, days: Array.from({ length: 7 }, (_, i) => addDays(ws, i)), tracks: layoutWeek(ws, placed) })
  return render(<MonthView month={now} weeks={weeks} byDay={itemsByDay(placed, start, end)} now={now} onItemClick={on.onItemClick} onDraft={on.onDraft} />)
}

describe("the month (C05, C06)", () => {
  // Head 9 (CR-67 MF2): a daily repeat's dates ahead, beside the task's own
  // entry on its day, each its own bar: no two keys alike.
  it("draws each date a daily task comes due ahead as its own bar", async () => {
    const { tasksAhead } = await import("@/lib/calendar/repeats")
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    const due = [12, 13, 14, 15, 16].map((d) => iso(d, 0))
    const ahead = tasksAhead({ checkins: [], tasks: [{ task_uuid: "t9", task_name: "Stand-up notes", rule: "FREQ=DAILY", due }] })
    const own = { event_uuid: "t9", event_title: "Stand-up notes", event_start_time: iso(12, 0), event_end_time: iso(12, 0), isTask: true }
    month([own, ...ahead.map((t) => ({ event_uuid: t.task_uuid, event_title: t.task_name, event_start_time: t.task_due_date, event_end_time: t.task_due_date, isTask: true }))])
    expect(document.querySelectorAll('[data-event-uuid^="t9"]').length).toBeGreaterThanOrEqual(6)
    expect(errors.mock.calls.some((c) => String(c[0]).includes("same key"))).toBe(false)
    errors.mockRestore()
  })

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

  it("opens the day's whole list there: an item opens beside +N more, and New event drafts 9:00 on that day", () => {
    const on = { onItemClick: vi.fn(), onDraft: vi.fn() }
    month([1, 2, 3, 4, 5].map((i) => ({ event_uuid: `m${i}`, event_title: `M${i}`, event_start_time: iso(15, 8 + i), event_end_time: iso(15, 9 + i) })), on)
    const more = screen.getByRole("button", { name: "+2 more" })
    fireEvent.click(more)
    const list = document.querySelector("[data-day-overflow]") as HTMLElement
    expect(within(list).getByText("Thu 15 Oct").className).toMatch(/text-brand-text/)
    expect(["M1", "M2", "M3", "M4", "M5"].every((t) => within(list).queryByText(t))).toBe(true)
    fireEvent.click(within(list).getByText("M5"))
    expect(on.onItemClick).toHaveBeenCalledWith(expect.objectContaining({ event_uuid: "m5" }), more)
    fireEvent.click(more)
    fireEvent.click(screen.getByRole("button", { name: "New event" }))
    expect(on.onDraft).toHaveBeenCalledWith({ start: new Date(2026, 9, 15, 9, 0), end: new Date(2026, 9, 15, 9, 30) }, more.parentElement)
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
    expect(dialog.textContent).toMatch(/Thu 15 Oct · 11\u00a0AM – 12\u00a0PM/)
    expect(dialog.textContent).toMatch(/in 1 hour/)
    expect(screen.getByRole("link", { name: /Join call/ }).getAttribute("href")).toBe("https://meet.example.com/abc")
  })

  // V-34: the pencil, Edit event, opens the event in full already editing.
  it("opens the full panel editing from the pencil", () => {
    const anchor = document.createElement("button")
    document.body.appendChild(anchor)
    const full = vi.fn()
    render(<EventPopover event={ev} anchor={anchor} now={now} onClose={vi.fn()} onOpenFull={full} />)
    fireEvent.click(screen.getByRole("button", { name: "Edit event" }))
    expect(full).toHaveBeenCalledWith("e1", { edit: true })
  })

  // Calendar B8: an event of a calendar you subscribe to is yours to see,
  // never to change; the card names its calendar and nobody as its organiser.
  it("offers no edit for an event of a calendar you subscribe to, and names that calendar", () => {
    const anchor = document.createElement("button")
    document.body.appendChild(anchor)
    const held = { ...ev, event_read_only: true, event_calendar_id: "c9", calendar_name: "Holidays in India", calendar_hue: "berry" }
    render(<EventPopover event={held} anchor={anchor} now={now} onClose={vi.fn()} onOpenFull={vi.fn()} />)
    const dialog = screen.getByRole("dialog", { name: "Design review" })
    expect(screen.queryByRole("button", { name: "Edit event" })).toBeNull()
    expect(dialog.textContent).toContain("Holidays in India")
    expect(dialog.textContent).not.toMatch(/Organised by/)
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

  // PTC-9: "Launch day", a day long from another zone, read "09:30 / 09:30 – 09:30".
  it("says a day-long event runs from its start and until its end, with both days", () => {
    const launch = { event_uuid: "launch", event_title: "Launch day", event_start_time: iso(15, 9, 30), event_end_time: iso(16, 9, 30) }
    render(<CalendarAgenda desktop days={[{ day: new Date(2026, 9, 15), items: [launch] }, { day: new Date(2026, 9, 16), items: [launch] }]} onOpen={vi.fn()} now={now} />)
    const rows = Array.from(document.querySelectorAll('[data-agenda] [data-event-uuid="launch"]')).map((r) => r.textContent ?? "")
    expect(rows[0]).toMatch(/^From .*9:30.*Launch day.*Thu.*9:30.*–.*Fri.*9:30/)
    expect(rows[1]).toMatch(/^Until .*9:30.*Launch day/)
  })
})

// Step 3, part 2 (the rivals review, 16 Oct): Join is a call's, and only
// while there is a call to join. Any link in the notes was a call ("Join
// call" on a doc's link), and after the event it read "Join call · starts
// ended".
describe("the event popover's Join", () => {
  const anchorEl = () => {
    const a = document.createElement("button")
    document.body.appendChild(a)
    return a
  }
  const at = (fromH: number, fromM: number, toH: number, description: string) => ({
    event_uuid: "e2",
    event_title: "Pricing sync",
    event_start_time: new Date(2026, 9, 15, fromH, fromM).toISOString(),
    event_end_time: new Date(2026, 9, 15, toH, 0).toISOString(),
    event_description: description,
  })
  const MEET = "<p>Join https://meet.example.com/abc</p>"

  it("is the primary from ten minutes before until the end", () => {
    render(<EventPopover event={at(10, 5, 11, MEET)} anchor={anchorEl()} now={now} onClose={vi.fn()} onOpenFull={vi.fn()} />)
    const join = screen.getByRole("link", { name: "Join call" })
    expect(join.className).toMatch(/bg-brand/)
  })

  it("is a quiet Join call before then, that leaves when to the line above it", () => {
    render(<EventPopover event={at(11, 0, 12, MEET)} anchor={anchorEl()} now={now} onClose={vi.fn()} onOpenFull={vi.fn()} />)
    const join = screen.getByRole("link", { name: "Join call" })
    expect(join.textContent).toBe("Join call")
    expect(join.className).not.toMatch(/bg-brand/)
  })

  it("is gone once the event has ended; the link is still in More", () => {
    render(<EventPopover event={at(8, 0, 9, MEET)} anchor={anchorEl()} now={now} onClose={vi.fn()} onOpenFull={vi.fn()} />)
    expect(screen.queryByRole("link", { name: /Join call/ })).toBeNull()
    expect(screen.getByRole("dialog", { name: "Pricing sync" }).textContent).not.toMatch(/starts/)
  })

  it("never offers a doc's link as a call, and finds the call after it, its &amp; read as &", () => {
    expect(joinLinkOf({ event_description: "<p>Notes: https://docs.example.com/d/1</p>" })).toBeNull()
    expect(joinLinkOf({ event_description: '<p>Agenda https://docs.example.com/x, then <a href="https://zoom.us/j/1?pwd=a&amp;x=1">Zoom</a></p>' })).toBe("https://zoom.us/j/1?pwd=a&x=1")
    render(<EventPopover event={at(10, 5, 11, "<p>Notes: https://docs.example.com/d/1</p>")} anchor={anchorEl()} now={now} onClose={vi.fn()} onOpenFull={vi.fn()} />)
    expect(screen.queryByRole("link", { name: /Join call/ })).toBeNull()
  })
})

// Calendar B11 (zoom-01, meet-02, zoom-15): an event carries its own call. Its organiser adds it from the card; a
// member joins it in the app as themselves, and its address is what a copy of the link shares.
describe("an event's own call", () => {
  const anchorEl = () => {
    const a = document.createElement("button")
    document.body.appendChild(a)
    return a
  }
  const CALL = { slug: "design-review-k3x9p2qa", address: "/r/design-review-k3x9p2qa" }
  const MAYA = { user_uuid: "5e1f0000-0000-4000-8000-0000000000a2", user_name: "Maya Chen" } as NonNullable<CalendarEventInterface["event_created_by"]>
  const ev = (over: Partial<CalendarEventInterface> = {}): CalendarEventInterface => ({
    event_uuid: "e3",
    event_title: "Design review",
    event_start_time: new Date(2026, 9, 15, 10, 5).toISOString(),
    event_end_time: new Date(2026, 9, 15, 11, 0).toISOString(),
    event_description: "",
    ...over,
  })
  afterEach(() => {
    sent.requests.length = 0
    sent.confirms.length = 0
  })

  it("is joined in the app, and its address is what is shared; a link in the notes is both", () => {
    const notes = "<p>Join https://meet.example.com/abc</p>"
    expect(eventCallOf(ev({ event_call: CALL, event_description: notes }), "https://camp.example.com")).toEqual({
      join: "/app/meet/join/r/design-review-k3x9p2qa",
      share: "https://camp.example.com/r/design-review-k3x9p2qa",
      own: true,
    })
    expect(eventCallOf(ev({ event_description: notes }), "https://camp.example.com")).toEqual({ join: "https://meet.example.com/abc", share: "https://meet.example.com/abc", own: false })
    expect(eventCallOf(ev({ event_call: null }), "https://camp.example.com")).toBeNull()
  })

  it("is offered to whoever may change the event: taken off once it has one, added while it has none, hasn't ended and has no link in its notes", () => {
    const may = { mayChange: true, google: false, ended: false }
    expect(eventCallChoice(ev(), may)).toBe("add")
    expect(eventCallChoice(ev({ event_call: CALL }), may)).toBe("remove")
    expect(eventCallChoice(ev({ event_call: CALL }), { ...may, ended: true })).toBe("remove")
    expect(eventCallChoice(ev(), { ...may, ended: true })).toBeNull()
    expect(eventCallChoice(ev({ event_description: "<p>Join https://meet.example.com/abc</p>" }), may)).toBeNull()
    expect(eventCallChoice(ev({ event_call: CALL }), { ...may, mayChange: false })).toBeNull()
    expect(eventCallChoice(ev({ event_call: CALL }), { ...may, google: true })).toBeNull()
  })

  it("opens from the card in the same tab", () => {
    render(<EventPopover event={ev({ event_call: CALL })} anchor={anchorEl()} now={now} onClose={vi.fn()} onOpenFull={vi.fn()} />)
    const join = screen.getByRole("link", { name: "Join call" })
    expect(join.getAttribute("href")).toBe("/app/meet/join/r/design-review-k3x9p2qa")
    expect(join.getAttribute("target")).toBeNull()
    expect(screen.queryByRole("button", { name: "Add a call" })).toBeNull()
  })

  it("is added from the card by its organiser, to an event with no call that hasn't ended", async () => {
    render(<EventPopover event={ev()} anchor={anchorEl()} now={now} onClose={vi.fn()} onOpenFull={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Add a call" }))
    await waitFor(() => expect(sent.requests).toHaveLength(1))
    expect(sent.requests[0]).toMatchObject({ method: "POST", appendToUrl: "/e3/call" })
  })

  it("isn't offered on someone else's event, a subscribed calendar's, Google's, or one that has ended", () => {
    const ended = { event_start_time: new Date(2026, 9, 15, 8).toISOString(), event_end_time: new Date(2026, 9, 15, 9).toISOString() }
    for (const e of [ev({ event_created_by: MAYA }), ev({ event_read_only: true }), ev({ event_uuid: "gcal-e3" }), ev(ended)]) {
      const { unmount } = render(<EventPopover event={e} anchor={anchorEl()} now={now} selfId="5e1f0000-0000-4000-8000-0000000000ff" onClose={vi.fn()} onOpenFull={vi.fn()} />)
      expect(screen.queryByRole("button", { name: "Add a call" }), e.event_uuid).toBeNull()
      unmount()
    }
  })
})
