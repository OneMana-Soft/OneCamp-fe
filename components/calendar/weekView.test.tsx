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

describe("now", () => {
  it("is drawn in the week that has today, and not in another", () => {
    const thisWeek = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 0)
    week({ weekStart: thisWeek })
    expect(document.querySelector("[data-now-line]")).toBeTruthy()
    cleanup()
    week({ weekStart: addDays(thisWeek, 14) })
    expect(document.querySelector("[data-now-line]")).toBeNull()
  })
})

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
    // A clock away from the week shown: on the day itself the note says
    // "Nothing on today", so this failed every 12 Oct 2026, the day it shows.
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 9, 1, 12))
    try {
      week({ dayCount: 1 })
      expect(screen.getByText("Nothing on this day")).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("the phone's agenda with nothing coming up", () => {
  it("draws the calendar over its words, as quietly as a free week does", () => {
    render(<CalendarAgenda days={[]} onOpen={vi.fn()} />)
    expect(screen.getByRole("heading", { name: "Nothing coming up this month" })).toBeTruthy()
    expect(document.querySelector("[data-empty-illustration] svg.hue-berry")).toBeTruthy()
    // The header's New event is the view's one action; the empty state adds no second.
    expect(screen.queryByRole("button", { name: /New event/ })).toBeNull()
    expect(document.querySelector("[data-empty-illustration]")?.className).not.toMatch(/size-24|h-24/)
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

// PTC-9: a timed event a day long sits in the all-day rail on both its days,
// and says which end each is.
describe("a day-long timed event", () => {
  it("says from on its first day and until on its last", () => {
    week({ events: [{ event_uuid: "launch", event_title: "Launch day", event_start_time: at(3, 9), event_end_time: at(4, 9) }] })
    const chips = Array.from(document.querySelectorAll('[data-all-day-rail] [data-event-uuid="launch"]'))
    expect(chips).toHaveLength(2)
    expect(chips[0].getAttribute("aria-label")).toMatch(/^Event: Launch day, From /)
    expect(chips[1].getAttribute("aria-label")).toMatch(/^Event: Launch day, Until /)
  })
})

// PTC-8: an event at 00:30 on Saturday opened the whole week at midnight.
describe("opening", () => {
  it("shows the hour before now when today is in view, whatever came earlier that week", () => {
    const scrolled = vi.fn()
    const had = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo")
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { value: scrolled, configurable: true })
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 2, 13, 20))
    try {
      week({ events: [{ event_uuid: "early", event_title: "Copy sync", event_start_time: at(5, 0), event_end_time: at(5, 1) }] })
      // 12:00 at 56 px an hour, its label clear of the top.
      expect(scrolled).toHaveBeenLastCalledWith(expect.objectContaining({ top: 12 * 56 - 12 }))
    } finally {
      vi.useRealTimers()
      if (had) Object.defineProperty(HTMLElement.prototype, "scrollTo", had)
      else delete (HTMLElement.prototype as unknown as { scrollTo?: unknown }).scrollTo
    }
  })
})

// PG2-30: on a busy day three or more overlapping events cascaded by 12 px
// over each other, so their titles drew over each other.
describe("a busy day of twelve", () => {
  const busy: Array<[string, number, number]> = [
    ["Gym", 8, 9],
    ["Standup prep", 8.5, 9.5],
    ["Focus: write the announcement", 9, 12],
    ["Standup", 9, 9.5],
    ["Support sync", 9.5, 10.5],
    ["Interview: senior engineer", 10, 11],
    ["Coffee with Maya", 10.25, 10.75],
    ["Launch review", 11, 12],
    ["Design crit", 11.5, 12.5],
    ["Lunch", 13, 14],
    ["1:1", 14, 15],
    ["Planning", 14.5, 16],
  ]
  const on = (h: number) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 1, Math.floor(h), (h % 1) * 60).toISOString()
  /** A block's [left, right] in a 704 px day, from the CSS it is drawn with. */
  const across = (el: HTMLElement) => {
    const px = (css: string) => Function(`return ${css.replace(/calc/g, "").replace(/100%/g, "704").replace(/px/g, "")}`)() as number
    const left = px(el.style.left)
    return [left, left + px(el.style.width)]
  }

  it("draws every event side by side, none over another it overlaps in time", () => {
    week({ events: busy.map(([title, from, to], i) => ({ event_uuid: `b${i}`, event_title: title, event_start_time: on(from), event_end_time: on(to) })) })
    const blocks = busy.map((_, i) => document.querySelector<HTMLElement>(`[data-hue-block][data-event-uuid="b${i}"]`)!)
    expect(blocks.every(Boolean)).toBe(true)
    for (let a = 0; a < busy.length; a++)
      for (let b = a + 1; b < busy.length; b++) {
        if (!(busy[a][1] < busy[b][2] && busy[b][1] < busy[a][2])) continue
        const [al, ar] = across(blocks[a])
        const [bl, br] = across(blocks[b])
        expect(ar <= bl || br <= al, `${busy[a][0]} and ${busy[b][0]}`).toBe(true)
      }
    // Lunch has the day to itself.
    expect(across(blocks[9])).toEqual([2, 702])
  })
})
