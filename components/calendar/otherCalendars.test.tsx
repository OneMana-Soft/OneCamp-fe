import { afterEach, describe, expect, it, vi } from "vitest"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"

// What the reads answer, by address (the subscriptions' list, B8).
// A read that failed answers its error, by the start of its address.
const fetched = vi.hoisted(() => ({ byUrl: {} as Record<string, unknown>, failing: {} as Record<string, unknown> }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => ({
    data: fetched.byUrl[url],
    isError: url ? Object.entries(fetched.failing).find(([start]) => url.startsWith(start))?.[1] : undefined,
    mutate: vi.fn(),
  }),
}))
const post = vi.hoisted(() => vi.fn())
const del = vi.hoisted(() => vi.fn())
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post, delete: del, get: vi.fn() } }))

import { CalendarListRow, CalendarsPanel, ownRows, type CalendarRow, type OtherCalendars } from "./calendarsPopover"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()
afterEach(cleanup)

const others = (p: Partial<OtherCalendars> = {}): OtherCalendars => ({
  mine: [{ id: "c3", name: "Family", kind: "external", access: "manage", mine: true }],
  calendars: [
    { id: "c1", name: "Launch", kind: "project", container_kind: "project", container_id: "p-1", access: "edit" },
    { id: "c4", name: "Maya Chen", kind: "personal", access: "manage" },
  ],
  people: [{ id: "c2", name: "Jonas" }],
  hidden: ["c2"],
  hues: {},
  hueOf: () => "moss",
  toggle: vi.fn(),
  show: vi.fn(),
  only: vi.fn(),
  recolour: vi.fn(),
  addPerson: vi.fn(),
  removePerson: vi.fn(),
  ...p,
})

const personal = (onOnly = vi.fn()): CalendarRow => ({ id: "onecamp", name: "Personal", on: true, onToggle: vi.fn(), onOnly })

function panel(
  o: OtherCalendars,
  extra: { rows?: CalendarRow[]; onDialog?: (open: (close: () => void) => ReactNode) => void; confirm?: (o: { onConfirm: () => void | Promise<void> }) => void } = {},
) {
  return render(
    <CalendarsPanel anchor={new Date(2026, 9, 15)} view="week" hasItems={() => false} onPick={vi.fn()} rows={extra.rows ?? [personal()]} onBookingPages={vi.fn()}
      googleConnected={false} others={o} countOf={(id) => (id === "c3" ? 4 : 0)} onDialog={extra.onDialog}
      confirm={extra.confirm} />,
  )
}

/** Opens a Radix menu in jsdom, as the menu tests do. */
function openMenu(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" })
  fireEvent.keyDown(trigger, { key: "Enter" })
}

// Calendar A6: the calendars beside your own one.
describe("calendars beside yours in the panel", () => {
  it("lists a project's calendar, one shared and a teammate's, each shown or not, and offers adding one", () => {
    const o = others()
    panel(o)
    expect(screen.getByRole("heading", { name: "Other calendars" })).toBeTruthy()
    expect(screen.getByRole("checkbox", { name: "Launch" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("checkbox", { name: "Maya Chen" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("checkbox", { name: "Jonas" }).getAttribute("aria-checked")).toBe("false")
    fireEvent.click(screen.getByRole("checkbox", { name: "Jonas" }))
    expect(o.toggle).toHaveBeenCalledWith("c2")
    fireEvent.click(screen.getByRole("button", { name: "Add a teammate's calendar" }))
    expect(screen.getByText("You see when they're busy, and more if they share it.")).toBeTruthy()
  })

  it("lists yours an import made under My calendars, after Personal, with its week's count", () => {
    panel(others())
    const mine = [...document.querySelectorAll("[data-calendar-row]")].map((r) => r.getAttribute("data-calendar-row"))
    expect(mine.slice(0, 2)).toEqual(["onecamp", "c3"])
    expect(document.querySelector("[data-calendar-row='c3']")?.textContent).toContain("4 this week")
    expect(document.querySelector("[data-other-calendars] [data-calendar-row='c3']")).toBeNull()
  })

  // F2's follow-up (DESIGN-BUILD-8): "0 this week" for a calendar whose events
  // couldn't be read says it's free. It says Couldn't load there instead.
  it("says Couldn't load where a calendar beside yours counts its week, when their read failed", () => {
    panel(others({ error: new Error("Request failed with status code 500") }))
    const row = (id: string) => document.querySelector(`[data-calendar-row='${id}']`)?.textContent ?? ""
    for (const id of ["c1", "c4"]) {
      expect(row(id)).toContain("Couldn't load")
      expect(row(id)).not.toContain("this week")
    }
    expect(row("c3")).toContain("4 this week")
  })

  it("shows only one calendar: the rest of these, and Personal, Google and tasks, are hidden", async () => {
    const o = others()
    const own = vi.fn()
    panel(o, { rows: [personal(own)] })
    openMenu(screen.getByRole("button", { name: "Launch options" }))
    fireEvent.click(await screen.findByRole("menuitem", { name: "Show only this" }))
    expect(o.only).toHaveBeenCalledWith("c1")
    // Only Personal: its own row says so, and the store hides the rest.
    openMenu(screen.getByRole("button", { name: "Personal options" }))
    fireEvent.click(await screen.findByRole("menuitem", { name: "Show only this" }))
    expect(own).toHaveBeenCalled()
  })

  it("shares your calendar, and one you may share, through a dialog the calendar holds; never a project's or one you only see", async () => {
    const opened: ((close: () => void) => ReactNode)[] = []
    panel(others(), { onDialog: (open) => opened.push(open) })
    openMenu(screen.getByRole("button", { name: "Personal options" }))
    fireEvent.click(await screen.findByRole("menuitem", { name: "Share" }))
    expect(opened).toHaveLength(1)
    openMenu(screen.getByRole("button", { name: "Maya Chen options" }))
    expect(await screen.findByRole("menuitem", { name: "Share" })).toBeTruthy()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    openMenu(screen.getByRole("button", { name: "Launch options" }))
    await screen.findByRole("menuitem", { name: "Show only this" })
    expect(screen.queryByRole("menuitem", { name: "Share" })).toBeNull()
  })

  it("shows any calendar in another app through a dialog the calendar holds, yours included", async () => {
    const opened: ((close: () => void) => ReactNode)[] = []
    panel(others(), { onDialog: (open) => opened.push(open) })
    openMenu(screen.getByRole("button", { name: "Personal options" }))
    fireEvent.click(await screen.findByRole("menuitem", { name: "Show in another app" }))
    openMenu(screen.getByRole("button", { name: "Launch options" }))
    fireEvent.click(await screen.findByRole("menuitem", { name: "Show in another app" }))
    expect(opened).toHaveLength(2)
  })

  it("gives a calendar a colour of your own on this device, or its own again", async () => {
    const o = others({ hues: { c1: "sun" } })
    panel(o)
    openMenu(screen.getByRole("button", { name: "Launch options" }))
    const colour = await screen.findByRole("menuitem", { name: "Colour" })
    fireEvent.keyDown(colour, { key: "ArrowRight" })
    expect((await screen.findByRole("menuitemradio", { name: "Sun" })).getAttribute("aria-checked")).toBe("true")
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Berry" }))
    expect(o.recolour).toHaveBeenCalledWith("c1", "berry")
  })
})

// While the list of calendars is still being read (or couldn't be), the
// layer hands the calendar what it has once, not again on every render: a
// new empty list each time had the calendar and the layer redraw each other
// without end.
// Calendar B8: a calendar read from an address is yours, under My calendars;
// its menu says how it was last read, reads it now, or removes it (asked
// first), never shares it or gives it a link; one that couldn't be read says so.
describe("a calendar you subscribe to, in the panel", () => {
  const holidays = { id: "c9", name: "Holidays in India", kind: "subscribed", access: "view" as const, mine: true }
  it("reads it now or removes it from its menu, and says when it couldn't be read", async () => {
    fetched.byUrl["/calendar/subscriptions"] = { data: [{ calendar_id: "c9", name: "Holidays in India", host: "calendar.google.com", read_at: "2026-10-15T09:55:00Z" }] }
    post.mockResolvedValue({ data: { data: {} } })
    del.mockResolvedValue({})
    const confirm = vi.fn()
    panel(others({ mine: [holidays] }), { onDialog: vi.fn(), confirm })
    // Read only and published by someone else: with the other calendars, where it was added.
    expect(document.querySelector("[data-other-calendars] [data-calendar-row='c9']")).toBeTruthy()
    expect(screen.getByRole("checkbox", { name: "Holidays in India" })).toBeTruthy()
    openMenu(screen.getByRole("button", { name: "Holidays in India options" }))
    expect((await screen.findByText(/^Read from calendar\.google\.com/)).closest("[data-subscription-words]")).toBeTruthy()
    expect(screen.queryByRole("menuitem", { name: "Share" })).toBeNull()
    expect(screen.queryByRole("menuitem", { name: "Show in another app" })).toBeNull()
    fireEvent.click(screen.getByRole("menuitem", { name: "Read it now" }))
    expect(post).toHaveBeenCalledWith("/calendar/subscriptions/c9/refresh", {}, OWN_ERRORS)
    openMenu(screen.getByRole("button", { name: "Holidays in India options" }))
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove calendar" }))
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: "Remove “Holidays in India”?", destructive: true }))
    await confirm.mock.calls[0][0].onConfirm()
    expect(del).toHaveBeenCalledWith("/calendar/subscriptions/c9", OWN_ERRORS)
    cleanup()
    fetched.byUrl["/calendar/subscriptions"] = { data: [{ calendar_id: "c9", name: "Holidays in India", host: "calendar.google.com", error: "The address took too long to answer." }] }
    panel(others({ mine: [holidays] }))
    expect(document.querySelector("[data-calendar-row='c9'] [data-calendar-warning]")?.getAttribute("title")).toBe("The address took too long to answer.")
    delete fetched.byUrl["/calendar/subscriptions"]
  })

  it("subscribes to one from Other calendars, through a dialog the calendar holds", () => {
    const onDialog = vi.fn()
    panel(others(), { onDialog })
    fireEvent.click(screen.getByRole("button", { name: "Subscribe to a calendar" }))
    expect(onDialog).toHaveBeenCalledTimes(1)
  })
})

describe("the other calendars' layer", () => {
  it("tells the calendar once while there is nothing yet, not on every render", async () => {
    const { default: OtherCalendarsLayer } = await import("./otherCalendarsLayer")
    const { useCallback, useState } = await import("react")
    const own: { event_uuid: string }[] = []
    const from = new Date(2026, 9, 1)
    const to = new Date(2026, 10, 1)
    let told = 0
    function Host() {
      const [, keep] = useState<unknown>()
      const change = useCallback((o: unknown) => {
        told++
        if (told > 20) throw new Error("the layer and the calendar redraw each other without end")
        keep(o)
      }, [])
      return <OtherCalendarsLayer from={from} to={to} own={own} onChange={change} />
    }
    render(<Host />)
    await new Promise((r) => setTimeout(r, 50))
    expect(told).toBeLessThanOrEqual(2)
  })

  // AUDIT-WEB F2: a teammate whose calendar couldn't be read isn't free.
  it("hands the calendar the read's error when others' events couldn't be read, not a week with none", async () => {
    const { default: OtherCalendarsLayer } = await import("./otherCalendarsLayer")
    const down = new Error("Request failed with status code 500")
    fetched.byUrl["/calendar/calendars"] = { data: [{ id: "c1", name: "Launch", kind: "project", access: "view" }] }
    fetched.failing["/calendar/calendars/events"] = down
    try {
      const change = vi.fn()
      render(<OtherCalendarsLayer from={new Date(2026, 9, 1)} to={new Date(2026, 10, 1)} own={[]} onChange={change} />)
      await vi.waitFor(() => expect(change).toHaveBeenCalled())
      const told = change.mock.lastCall?.[0] as { error?: unknown; events: unknown[] }
      expect(told.error).toBe(down)
      expect(told.events).toEqual([])
    } finally {
      delete fetched.byUrl["/calendar/calendars"]
      delete fetched.failing["/calendar/calendars/events"]
    }
  })
})

// The hue ruling (21 Oct): Google's row says it is Google's with Google's G,
// and keeps no colour of its own; your own is the calendar's sun.
describe("your own rows' marks", () => {
  it("draws Google's G on its row, with no colour, and Personal in sun", () => {
    const rows = ownRows({ hidden: [], google: true, weekCount: () => 0, tasks: [] })
    render(
      <>
        {rows.map((r) => (
          <CalendarListRow key={r.id} row={r} />
        ))}
      </>,
    )
    const google = document.querySelector('[data-calendar-row="google"]') as HTMLElement
    expect(google.querySelector("[data-google-mark]")).toBeTruthy()
    expect(google.querySelector('[role="checkbox"]')?.className).not.toMatch(/\bhue-/)
    expect(rows.find((r) => r.id === "onecamp")?.hue).toBe("sun")
  })
})
