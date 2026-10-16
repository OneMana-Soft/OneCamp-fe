import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// What the calendar asks the server for, by URL, and what each answers.
const asked: string[] = []
let connected = false
let account = ""
let loading = false
let failing = false
let free = false
let mobile = false
// Set by a test that wants its own events back for every range.
let events: unknown[] | null = null
const now = new Date()
const iso = (d: number, h: number) => new Date(now.getFullYear(), now.getMonth(), d, h).toISOString()
const standup = () => ({ event_uuid: "e1", event_title: "Standup", event_start_time: iso(now.getDate(), 9), event_end_time: iso(now.getDate(), 10), event_created_by: { user_uuid: "me", user_name: "Sam" } })
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    asked.push(url)
    if (loading && (url.includes("/event/getEvents") || url.includes("assignedTaskList"))) return { data: undefined, isLoading: true, mutate: vi.fn() }
    if (failing && url.includes("/event/getEvents")) return { data: undefined, isLoading: false, isError: new Error("502"), mutate: vi.fn() }
    if (url.includes("/event/getEvents")) return { data: { data: events ?? (free ? [] : [standup()]) }, isLoading: false, mutate: vi.fn() }
    if (url.includes("assignedTaskList")) return { data: { data: { user_tasks: [] } }, isLoading: false, mutate: vi.fn() }
    if (url.includes("bookingPages")) return { data: { data: [{}, {}] }, isLoading: false, mutate: vi.fn() }
    return { data: { data: { isConnected: connected, accountEmail: account } }, isLoading: false, mutate: vi.fn(async () => ({ data: { isConnected: connected, accountEmail: account } })) }
  },
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }),
}))
const makeRequest = vi.fn()
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
const confirm = vi.fn()
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: mobile, isDesktop: !mobile }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/components/calendar/createCalendarEventDialog", () => ({ CreateCalendarEventDialog: () => null }))

import { CalendarApp, periodTitle, periodTitles } from "./calendarApp"

afterEach(() => {
  cleanup()
  asked.length = 0
  confirm.mockReset()
  connected = false
  account = ""
  toast.mockReset()
  loading = false
  failing = false
  free = false
  mobile = false
  events = null
  vi.useRealTimers()
  vi.restoreAllMocks()
  makeRequest.mockReset()
})

const ranges = () => new Set(asked.filter((u) => u.includes("/event/getEvents")))
const views = () => screen.getAllByRole("button", { pressed: false }).concat(screen.getAllByRole("button", { pressed: true })).filter((b) => b.closest("[data-calendar-views]"))

describe("the calendar", () => {
  it("has one sidebar: no second calendar sidebar, the calendars behind one button", () => {
    render(<CalendarApp />)
    expect(document.querySelector("aside")).toBeNull()
    expect(document.querySelector(".w-64")).toBeNull()
    expect(screen.getByRole("button", { name: /Calendars/ })).toBeTruthy()
  })

  it("lists Google Calendar and the booking pages in the calendars popover", () => {
    render(<CalendarApp />)
    fireEvent.click(screen.getByRole("button", { name: /Calendars/ }))
    expect(screen.getByRole("button", { name: /Connect Google Calendar/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Booking pages/ })).toBeTruthy()
    expect(screen.getByRole("checkbox", { name: "Personal" })).toBeTruthy()
  })

  it("asks before disconnecting Google Calendar", () => {
    connected = true
    render(<CalendarApp />)
    fireEvent.click(screen.getByRole("button", { name: /Calendars/ }))
    fireEvent.click(screen.getByRole("button", { name: "Disconnect Google Calendar" }))
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: "Disconnect Google Calendar?", destructive: true }))
  })

  it("has one primary action, New event", () => {
    render(<CalendarApp />)
    const primaries = screen.getAllByRole("button").filter((b) => /\bbg-brand\b/.test(b.className))
    expect(primaries.map((b) => b.textContent)).toEqual(["New eventC"])
  })

  // Integration review, 12 Oct: at 768 beside the rail the header's title was
  // cut to "12–18 …". Under 46rem of header New event keeps its plus alone.
  it("folds New event to its plus under 46rem of header, still named New event", () => {
    render(<CalendarApp />)
    const add = document.querySelector("[data-new-event]") as HTMLElement
    expect(add.getAttribute("aria-label")).toBe("New event")
    expect(add.className).toContain("@max-[46rem]/calhead:w-8")
    const words = Array.from(add.querySelectorAll("span")).find((s) => s.textContent === "New event") as HTMLElement
    expect(words.className).toBe("hidden @[46rem]/calhead:inline")
  })

  it("switches views with four buttons over one sliding thumb, asking for nothing new", () => {
    render(<CalendarApp />)
    const first = ranges()
    expect(views().map((b) => b.textContent).sort()).toEqual(["Agenda", "Day", "Month", "Week"])
    expect(document.querySelectorAll("[data-calendar-views] [data-thumb]")).toHaveLength(1)
    expect(screen.getByRole("button", { name: "Week", pressed: true })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Month" }))
    const thumb = document.querySelector("[data-thumb]") as HTMLElement
    expect(thumb.style.transform).toBe("translateX(128px)")
    fireEvent.click(screen.getByRole("button", { name: "Day" }))
    expect(screen.getByRole("button", { name: "Previous day" })).toBeTruthy()
    expect(ranges()).toEqual(first)
  })

  it("takes D, W, M, A, T, J and K from the keyboard, but not while typing", () => {
    render(<CalendarApp />)
    act(() => void fireEvent.keyDown(window, { key: "m" }))
    expect(screen.getByRole("button", { name: "Month", pressed: true })).toBeTruthy()
    act(() => void fireEvent.keyDown(window, { key: "a" }))
    expect(screen.getByRole("button", { name: "Agenda", pressed: true })).toBeTruthy()
    act(() => void fireEvent.keyDown(window, { key: "d" }))
    const title = () => document.querySelector("[aria-live]")?.textContent
    const today = title()
    act(() => void fireEvent.keyDown(window, { key: "j" }))
    expect(title()).not.toBe(today)
    act(() => void fireEvent.keyDown(window, { key: "k" }))
    expect(title()).toBe(today)
    act(() => void fireEvent.keyDown(window, { key: "j" }))
    act(() => void fireEvent.keyDown(window, { key: "t" }))
    expect(title()).toBe(today)
    fireEvent.click(screen.getByRole("button", { name: "Search events" }))
    const box = screen.getByRole("textbox", { name: "Search events" })
    fireEvent.keyDown(box, { key: "w" })
    expect(screen.getByRole("button", { name: "Day", pressed: true })).toBeTruthy()
  })

  it("says it is loading with a dot beside the period, not a bar", () => {
    loading = true
    render(<CalendarApp />)
    const status = screen.getByRole("status")
    expect(status.textContent).toBe("Loading…")
    expect(status.hasAttribute("data-calendar-loading")).toBe(true)
    expect(document.querySelector(".animate-pulse.bg-primary\\/70")).toBeNull()
  })

  it("says a free month is free", () => {
    free = true
    render(<CalendarApp />)
    fireEvent.click(screen.getByRole("button", { name: "Month" }))
    expect(screen.getByText("Nothing this month")).toBeTruthy()
  })

  it("says a failed load failed, rather than showing an empty month", () => {
    failing = true
    render(<CalendarApp />)
    expect(screen.getByRole("heading", { name: "Couldn't load your calendar" })).toBeTruthy()
  })

  it("colours a personal event by its calendar", () => {
    render(<CalendarApp />)
    fireEvent.click(screen.getByRole("button", { name: "Month" }))
    const bar = document.querySelector('[data-event-uuid="e1"]') as HTMLElement
    expect(bar.getAttribute("data-hue")).toBe("sky")
  })

  it("opens an event as a popover beside it, not the panel", () => {
    render(<CalendarApp />)
    fireEvent.click(screen.getByRole("button", { name: "Month" }))
    fireEvent.click(document.querySelector('[data-event-uuid="e1"]') as HTMLElement, { detail: 0 })
    expect(screen.getByRole("dialog", { name: "Standup" })).toBeTruthy()
  })

  it("opens on the agenda on a phone, with a strip of the week's days", () => {
    mobile = true
    render(<CalendarApp />)
    expect(screen.getByRole("button", { name: "agenda", pressed: true })).toBeTruthy()
    expect(document.querySelectorAll("[data-week-strip] button")).toHaveLength(7)
    expect(screen.getByRole("button", { name: "New event" })).toBeTruthy()
  })

  // The week strip carries the arrows on a phone, and the month view hides
  // the strip: a month on a phone had no way to the next one.
  it("pages a phone's month view by month", () => {
    mobile = true
    render(<CalendarApp />)
    fireEvent.click(screen.getByRole("button", { name: "month" }))
    const title = () => document.querySelector("[data-period-title]")?.textContent ?? ""
    const before = title()
    fireEvent.click(screen.getByRole("button", { name: "Next month" }))
    expect(title()).not.toBe(before)
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }))
    expect(title()).toBe(before)
    fireEvent.click(screen.getByRole("button", { name: "agenda" }))
    expect(screen.queryByRole("button", { name: "Next month" })).toBeNull()
  })

  it("titles each period", () => {
    const d = new Date(2026, 9, 15)
    expect(periodTitle("month", d)).toBe("October 2026")
    expect(periodTitle("week", d)).toBe("12 – 18 Oct 2026")
    expect(periodTitle("day", d)).toBe("Thursday 15 October 2026")
  })

  // The header shows the first wording that fits, so a narrow sheet (1120 px
  // read "12 – 18 Oct 20…") drops the year, then tightens, and never cuts.
  it("says each period ever shorter: the year goes first", () => {
    const d = new Date(2026, 9, 15)
    expect(periodTitles("week", d)).toEqual(["12 – 18 Oct 2026", "12 – 18 Oct", "12–18 Oct"])
    expect(periodTitles("week", new Date(2026, 9, 1))).toEqual(["28 Sep – 4 Oct 2026", "28 Sep – 4 Oct", "28 Sep–4 Oct"])
    expect(periodTitles("week", new Date(2026, 11, 31))).toEqual(["28 Dec 2026 – 3 Jan 2027", "28 Dec – 3 Jan 2027", "28 Dec – 3 Jan", "28 Dec–3 Jan"])
    expect(periodTitles("month", d)).toEqual(["October 2026", "Oct 2026", "Oct"])
    expect(periodTitles("day", d)).toEqual(["Thursday 15 October 2026", "Thu 15 Oct 2026", "Thu 15 Oct", "15 Oct"])
    for (const v of ["day", "week", "month", "agenda"] as const) {
      const t = periodTitles(v, d)
      for (let i = 1; i < t.length; i++) expect(t[i].length).toBeLessThan(t[i - 1].length)
    }
  })

  it("puts the period in a label that fits its room, with the full wording read out", () => {
    render(<CalendarApp />)
    const label = document.querySelector("[data-calendar-header] [data-period-title]")
    expect(label?.hasAttribute("data-fit-label")).toBe(true)
    expect(label?.getAttribute("aria-live")).toBe("polite")
  })
})

// CAL-BUG-19: the agenda paged a month from the chosen day, so on 13 October
// it listed to 1 November and Next began on 13 November: 2 to 12 November
// never showed. It pages by what it listed now.
describe("the desktop agenda", () => {
  it("pages by what it listed, so no day is ever skipped", () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 9, 13, 9))
    const on = (month: number, day: number) => ({
      event_uuid: `e-${month}-${day}`,
      event_title: `Meeting ${day}/${month + 1}`,
      event_start_time: new Date(2026, month, day, 10).toISOString(),
      event_end_time: new Date(2026, month, day, 11).toISOString(),
    })
    events = [on(9, 5), on(9, 20), on(9, 30), on(10, 2), on(10, 5)]
    render(<CalendarApp />)
    fireEvent.click(screen.getByRole("button", { name: "Agenda" }))
    // The title's text holds each of its wordings, longest first.
    const title = () => document.querySelector("[data-calendar-header] [data-period-title]")?.textContent ?? ""
    const listed = () => Array.from(document.querySelectorAll("[data-agenda] section")).map((s) => s.getAttribute("aria-label"))
    expect(listed()).toEqual(["Tuesday 20 Oct", "Friday 30 Oct"])
    act(() => void fireEvent.keyDown(window, { key: "j" }))
    expect(listed()).toEqual(["Monday 2 Nov", "Thursday 5 Nov"])
    expect(title()).toContain("November 2026")
    // Back from November: the whole of October.
    act(() => void fireEvent.keyDown(window, { key: "k" }))
    expect(listed()).toEqual(["Monday 5 Oct", "Tuesday 20 Oct", "Friday 30 Oct"])
    expect(title()).toContain("October 2026")
    // From today, back: 1 to 12 October, the days the first window began after.
    act(() => void fireEvent.keyDown(window, { key: "t" }))
    act(() => void fireEvent.keyDown(window, { key: "k" }))
    expect(listed()).toEqual(["Monday 5 Oct"])
    expect(title()).toContain("1 – 12 Oct 2026")
    fireEvent.click(screen.getByRole("button", { name: "Next month" }))
    expect(listed()).toEqual(["Tuesday 20 Oct", "Friday 30 Oct"])
  })
})

// CAL-BUG-4: a booking is an ordinary event on its owner's calendar, and
// dragging it to another time left its guest untold, at the old time.
describe("moving a booked meeting", () => {
  it("asks first, naming its guest, and moves nothing until confirmed", async () => {
    if (typeof window.PointerEvent === "undefined") {
      class PointerEventPolyfill extends MouseEvent {
        pointerId: number
        constructor(type: string, init: PointerEventInit = {}) {
          super(type, init)
          this.pointerId = init.pointerId ?? 1
        }
      }
      ;(window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = PointerEventPolyfill
    }
    // Seven 100px columns after a 56px gutter, the grid's top at 0: an hour is 56px.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const col = this.dataset?.dayCol
      const left = col !== undefined ? 56 + Number(col) * 100 : 56
      return { left, right: left + (col !== undefined ? 100 : 700), top: 0, bottom: 24 * 56, width: col !== undefined ? 100 : 700, height: 24 * 56, x: left, y: 0, toJSON: () => ({}) } as DOMRect
    })
    events = [{ ...standup(), event_booking: { guest_name: "Alex Kim", page_title: "Intro call", guest_told: true } }]
    render(<CalendarApp />)
    const block = document.querySelector('[data-hue-block="event"]') as HTMLElement
    const column = block.closest("[data-day-col]") as HTMLElement
    const x = 56 + Number(column.dataset.dayCol) * 100 + 50
    fireEvent.pointerDown(block, { button: 0, clientX: x, clientY: 9 * 56 + 5 })
    fireEvent.pointerMove(column.parentElement!, { clientX: x, clientY: 11 * 56 + 5 })
    fireEvent.pointerUp(column.parentElement!, { clientX: x, clientY: 11 * 56 + 5 })
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: "Move this booked meeting?", confirmText: "Move and tell Alex Kim" }))
    expect(confirm.mock.calls[0][0].description).toMatch(/^Alex Kim booked it through Intro call\. We'll email them the new time, .*11:00/)
    expect(makeRequest).not.toHaveBeenCalled()
    await act(async () => {
      await confirm.mock.calls[0][0].onConfirm()
    })
    expect(makeRequest).toHaveBeenCalledTimes(1)
  })
})

// CAL-BUG-8: Google Calendar links through the connectors flow now, whose
// callback lands on the calendar with ?connector=success|error.
describe("linking Google Calendar", () => {
  it("says which Google account is connected", () => {
    connected = true
    account = "maya@gmail.com"
    render(<CalendarApp />)
    fireEvent.click(screen.getByRole("button", { name: /Calendars/ }))
    expect(document.querySelector("[data-google-account]")?.textContent).toBe("Connected as maya@gmail.com")
  })

  it("says so on coming back from Google, and drops the answer from the address", async () => {
    connected = true
    account = "maya@gmail.com"
    window.history.replaceState({}, "", "/app/calendar?connector=success&provider=google_calendar")
    await act(async () => {
      render(<CalendarApp />)
    })
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Google Calendar is connected", description: "Connected as maya@gmail.com." }))
    expect(window.location.search).toBe("")
  })

  it("says when the sign-in didn't finish", async () => {
    window.history.replaceState({}, "", "/app/calendar?connector=error")
    await act(async () => {
      render(<CalendarApp />)
    })
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't connect Google Calendar", variant: "destructive" }))
    expect(window.location.search).toBe("")
  })
})

