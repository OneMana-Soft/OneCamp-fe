import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

// What the calendar asks the server for, by URL, and what each answers.
const asked: string[] = []
let connected = false
let account = ""
let loading = false
let failing = false
let free = false
let mobile = false
// Set by a test that wants its own events (or tasks) back for every range.
let events: unknown[] | null = null
let taskList: unknown[] = []
const now = TEST_TODAY
const iso = (d: number, h: number) => new Date(now.getFullYear(), now.getMonth(), d, h).toISOString()
const standup = () => ({ event_uuid: "e1", event_title: "Standup", event_start_time: iso(now.getDate(), 9), event_end_time: iso(now.getDate(), 10), event_created_by: { user_uuid: "me", user_name: "Sam" } })
// Asking the events and the tasks again (and patching the events' copy).
const refetch = vi.fn()
// The server's optional features (useClientConfig), asked of nothing here:
// repeats are off, as on a server whose calendar isn't in its one store,
// unless a test says they're on.
let repeatsOn = false
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useFeature: (name: string) => repeatsOn && name === "calendar_repeats",
}))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    asked.push(url)
    if (loading && (url.includes("/event/getEvents") || url.includes("assignedTaskList"))) return { data: undefined, isLoading: true, mutate: refetch }
    if (failing && url.includes("/event/getEvents")) return { data: undefined, isLoading: false, isError: new Error("502"), mutate: refetch }
    if (url.includes("/event/getEvents")) return { data: { data: events ?? (free ? [] : [standup()]) }, isLoading: false, mutate: refetch }
    if (url.includes("assignedTaskList")) return { data: { data: { user_tasks: taskList } }, isLoading: false, mutate: refetch }
    if (url.includes("bookingPages")) return { data: { data: [{}, {}] }, isLoading: false, mutate: vi.fn() }
    return { data: { data: { isConnected: connected, accountEmail: account } }, isLoading: false, mutate: vi.fn(async () => ({ data: { isConnected: connected, accountEmail: account } })) }
  },
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }),
}))
// Every task of the range, as useAssignedTasks reads them page by page (its own test).
let taskRange = ""
vi.mock("@/hooks/useAssignedTasks", () => ({
  useAssignedTasks: (range: string) => {
    taskRange = range
    return loading ? { data: undefined, isLoading: true, mutate: refetch } : { data: { msg: "", data: { user_tasks: taskList } }, isLoading: false, mutate: refetch }
  },
}))
const makeRequest = vi.fn()
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
const confirm = vi.fn()
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: mobile, isDesktop: !mobile }) }))
const dispatch = vi.fn()
// What the right panel shows: the calendar reads which event is open beside it.
let panel = { isOpen: false, data: { eventUUID: "" } }
vi.mock("react-redux", () => ({ useDispatch: () => dispatch, useSelector: (pick: (s: unknown) => unknown) => pick({ rightPanel: { rightPanelState: panel } }) }))
const copy = vi.fn()
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copy }) }))
const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), useSearchParams: () => new URLSearchParams(window.location.search) }))
// The full dialog: whether it is open, and what it opened with.
let dialog: { open: boolean; initial?: unknown } = { open: false }
vi.mock("@/components/calendar/createCalendarEventDialog", () => ({
  CreateCalendarEventDialog: (p: { open: boolean; initial?: unknown }) => {
    dialog = { open: p.open, initial: p.initial }
    return null
  },
}))

import { CalendarApp, periodTitle, periodTitles } from "./calendarApp"
import { CALENDAR_KEYS, type CalendarCommand } from "@/lib/calendar/keys"
import { deleteEventConfirm, deleteEventRequest } from "@/lib/calendar/confirmDelete"
import { installPointerEvent } from "@/lib/testing/pointerEvent"
import { pinTestClock, TEST_TODAY } from "@/lib/testing/testClock"

// Today is TEST_TODAY wherever the code under test reads the time.
pinTestClock()

// The surfaces the calendar loads on first use, loaded once for the file:
// a first dynamic import can take more than a second on a busy machine.
beforeAll(async () => {
  await Promise.all([import("./calendarsPopover"), import("./goToDate"), import("./eventMenu"), import("./eventPopover"), import("./scopePromptDialog"), import("./seriesChanges")])
})

beforeEach(() => {
  window.history.replaceState({}, "", "/app/calendar")
})

afterEach(() => {
  cleanup()
  dispatch.mockReset()
  push.mockReset()
  refetch.mockReset()
  copy.mockReset()
  dialog = { open: false }
  panel = { isOpen: false, data: { eventUUID: "" } }
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
  taskList = []
  vi.useRealTimers()
  vi.restoreAllMocks()
  makeRequest.mockReset()
})

const ranges = () => new Set(asked.filter((u) => u.includes("/event/getEvents")))

/**
 * Drags the week's first event two hours later. Seven 100px columns after a
 * 56px gutter, the grid's top at 0: an hour is 56px.
 */
function dragFirstEventTwoHours() {
  installPointerEvent()
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const col = this.dataset?.dayCol
    const left = col !== undefined ? 56 + Number(col) * 100 : 56
    return { left, right: left + (col !== undefined ? 100 : 700), top: 0, bottom: 24 * 56, width: col !== undefined ? 100 : 700, height: 24 * 56, x: left, y: 0, toJSON: () => ({}) } as DOMRect
  })
  const block = document.querySelector('[data-hue-block="event"]') as HTMLElement
  const column = block.closest("[data-day-col]") as HTMLElement
  const x = 56 + Number(column.dataset.dayCol) * 100 + 50
  fireEvent.pointerDown(block, { button: 0, clientX: x, clientY: 9 * 56 + 5 })
  fireEvent.pointerMove(column.parentElement!, { clientX: x, clientY: 11 * 56 + 5 })
  fireEvent.pointerUp(column.parentElement!, { clientX: x, clientY: 11 * 56 + 5 })
}
/** The month view is a chunk of its own: shown once its code is in. */
const showMonth = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Month" }))
  await waitFor(() => expect(document.querySelector("[data-month-grid]")).toBeTruthy())
}
const views = () => screen.getAllByRole("button", { pressed: false }).concat(screen.getAllByRole("button", { pressed: true })).filter((b) => b.closest("[data-calendar-views]"))

describe("the calendar", () => {
  it("has one sidebar: no second calendar sidebar, the calendars behind one button", () => {
    render(<CalendarApp />)
    expect(document.querySelector("aside")).toBeNull()
    expect(document.querySelector(".w-64")).toBeNull()
    expect(screen.getByRole("button", { name: /Calendars/ })).toBeTruthy()
  })

  it("lists Google Calendar and the booking pages in the calendars popover", async () => {
    render(<CalendarApp />)
    fireEvent.click(screen.getByRole("button", { name: /Calendars/ }))
    expect(await screen.findByRole("button", { name: /Connect Google Calendar/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Booking pages/ })).toBeTruthy()
    expect(screen.getByRole("checkbox", { name: "Personal" })).toBeTruthy()
  })

  it("asks before disconnecting Google Calendar", async () => {
    connected = true
    render(<CalendarApp />)
    fireEvent.click(screen.getByRole("button", { name: /Calendars/ }))
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect Google Calendar" }))
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
    // Whole segments: 64 px each, 52 under 40rem of header (the panel open at
    // 1280), where the search (/ opens it) steps aside, so the period stays whole.
    expect(thumb.style.transform).toBe("translateX(calc(var(--seg) * 2))")
    expect(document.querySelector("[data-calendar-views]")!.className).toMatch(/\[--seg:64px\] @max-\[40rem\]\/calhead:\[--seg:52px\]/)
    expect(screen.getByRole("button", { name: "Search events" }).className).toMatch(/@max-\[40rem\]\/calhead:hidden/)
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

  it("says a free month is free", async () => {
    free = true
    render(<CalendarApp />)
    await showMonth()
    expect(screen.getByText("Nothing this month")).toBeTruthy()
  })

  it("says a failed load failed, rather than showing an empty month", () => {
    failing = true
    render(<CalendarApp />)
    expect(screen.getByRole("heading", { name: "Couldn't load your calendar" })).toBeTruthy()
  })

  it("colours a personal event by its calendar", async () => {
    render(<CalendarApp />)
    await showMonth()
    const bar = document.querySelector('[data-event-uuid="e1"]') as HTMLElement
    expect(bar.getAttribute("data-hue")).toBe("sky")
  })

  it("opens an event as a popover beside it, not the panel", async () => {
    render(<CalendarApp />)
    await showMonth()
    fireEvent.click(document.querySelector('[data-event-uuid="e1"]') as HTMLElement, { detail: 0 })
    expect(await screen.findByRole("dialog", { name: "Standup" })).toBeTruthy()
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

  // Under a finger each arrow reaches 8px past its 28px box (app/phone.css F3),
  // and the later one is on top. Side by side, Next month's reach covered the
  // right 8px of Previous month: a tap there (Chromium, touch emulation) went
  // to the next month. 16px apart, the two reaches only meet.
  it("keeps a phone's month arrows' reaches apart", () => {
    mobile = true
    render(<CalendarApp />)
    fireEvent.click(screen.getByRole("button", { name: "month" }))
    const pair = document.querySelector("[data-month-step]") as HTMLElement
    expect(pair.contains(screen.getByRole("button", { name: "Previous month" }))).toBe(true)
    // The one rule for a row of small controls: a touch group stands them 44px
    // less their size apart under a finger (app/phone.css F3b); a row spaced
    // by a coarse gap of its own would do the same.
    const grouped = pair.getAttribute("data-touch-group")
    const coarseGap = /(?:^|\s)pointer-coarse:gap-(\d+(?:\.\d+)?)(?:\s|$)/.exec(pair.className)
    expect(grouped === "" || Number(coarseGap?.[1] ?? 0) * 4 >= 16).toBe(true)
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
    vi.useRealTimers()
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
    events = [{ ...standup(), event_booking: { guest_name: "Alex Kim", page_title: "Intro call", guest_told: true } }]
    render(<CalendarApp />)
    dragFirstEventTwoHours()
    // Its question comes with its own small chunk, asked for on the move.
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: "Move this booked meeting?", confirmText: "Move and tell Alex Kim" })))
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
  it("says which Google account is connected", async () => {
    connected = true
    account = "maya@gmail.com"
    render(<CalendarApp />)
    fireEvent.click(screen.getByRole("button", { name: /Calendars/ }))
    expect((await screen.findByText("Connected as maya@gmail.com")).hasAttribute("data-google-account")).toBe(true)
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


// FE-F-2: the date and the view weren't in the address, so a reload or Back
// lost them and no link could point at a day.
describe("the calendar's address", () => {
  const title = () => document.querySelector("[data-calendar-header] [data-period-title]")?.textContent ?? ""
  const on13Oct = () => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 9, 13, 9))
  }

  it("opens on the day and the view it names", () => {
    window.history.replaceState({}, "", "/app/calendar?date=2026-11-05&view=month")
    render(<CalendarApp />)
    expect(screen.getByRole("button", { name: "Month", pressed: true })).toBeTruthy()
    expect(title()).toContain("November 2026")
  })

  it("says the day, and then the view, as you move, and nothing on opening", () => {
    on13Oct()
    render(<CalendarApp />)
    expect(window.location.search).toBe("")
    act(() => void fireEvent.keyDown(window, { key: "j" }))
    expect(window.location.search).toBe("?date=2026-10-20")
    fireEvent.click(screen.getByRole("button", { name: "Month" }))
    expect(window.location.search).toBe("?date=2026-10-20&view=month")
    expect(window.location.pathname).toBe("/app/calendar")
  })

  // The link that opens an event on a computer lands on the calendar with
  // the event beside it, and its address stays /app/calendar until you move.
  it("leaves the address alone on opening with an event beside it", () => {
    panel = { isOpen: true, data: { eventUUID: "e1" } }
    render(<CalendarApp />)
    expect(window.location.search).toBe("")
  })

  it("names the event open beside it, and drops it when the panel closes", () => {
    on13Oct()
    const { rerender } = render(<CalendarApp />)
    panel = { isOpen: true, data: { eventUUID: "e1" } }
    rerender(<CalendarApp />)
    expect(window.location.search).toBe("?date=2026-10-13&event=e1")
    panel = { isOpen: false, data: { eventUUID: "e1" } }
    rerender(<CalendarApp />)
    expect(window.location.search).toBe("?date=2026-10-13")
  })

  it("opens the event it names beside the calendar, over what the panel had", () => {
    panel = { isOpen: true, data: { eventUUID: "another" } }
    window.history.replaceState({}, "", "/app/calendar?date=2026-10-13&event=e1")
    render(<CalendarApp />)
    expect(dispatch).toHaveBeenCalledWith({ type: "rightPanel/openRightPanel", payload: { eventUUID: "e1" } })
  })

  it("opens the event it names at its page on a phone, and drops it so Back comes to the calendar", () => {
    mobile = true
    window.history.replaceState({}, "", "/app/calendar?date=2026-10-13&event=e1")
    render(<CalendarApp />)
    expect(push).toHaveBeenCalledWith("/app/calendar/event/e1")
    expect(window.location.search).toBe("?date=2026-10-13")
  })

  it("goes where a link or Back takes its address", () => {
    on13Oct()
    const { rerender } = render(<CalendarApp />)
    window.history.replaceState({}, "", "/app/calendar?date=2026-12-01&view=month")
    rerender(<CalendarApp />)
    expect(screen.getByRole("button", { name: "Month", pressed: true })).toBeTruthy()
    expect(title()).toContain("December 2026")
  })
})

// VD-28 … 34, FE-F-3: Google Calendar's keys, from the one table the
// shortcut list shows. Every row does what it says, by each of its keys.
describe("the calendar's keys", () => {
  const title = () => document.querySelector("[data-calendar-header] [data-period-title]")?.textContent ?? ""
  const keyOf = (chord: string) => {
    const parts = chord.split(/-(?!$)/)
    return { key: parts.pop()!, ctrlKey: parts.includes("Mod"), shiftKey: parts.includes("Shift"), altKey: parts.includes("Alt") }
  }
  const press = (chord: string, on: Element | Window = window) => act(() => void fireEvent.keyDown(on, keyOf(chord)))
  const standupBlock = () => {
    const block = document.querySelector<HTMLElement>('[data-calendar] [data-event-uuid="e1"]')!
    block.focus()
    return block
  }
  const opened = (uuid: string) => ({ type: "rightPanel/openRightPanel", payload: { eventUUID: uuid } })
  const pressed = (name: string) => screen.getByRole("button", { name, pressed: true })
  const nineOClock = () => iso(now.getDate(), 9)
  const moveStandup = async () => {
    makeRequest.mockResolvedValue({})
    dragFirstEventTwoHours()
    await act(async () => {})
    makeRequest.mockClear()
  }

  const does: Record<CalendarCommand, (chord: string) => void | Promise<void>> = {
    next: (k) => {
      const before = title()
      press(k)
      expect(title()).not.toBe(before)
    },
    previous: (k) => {
      const before = title()
      press(k)
      expect(title()).not.toBe(before)
    },
    today: (k) => {
      const today = title()
      press("j")
      press(k)
      expect(title()).toBe(today)
    },
    goTo: async (k) => {
      press(k)
      expect(await screen.findByRole("textbox", { name: "Go to a date" })).toBeTruthy()
    },
    day: (k) => {
      press(k)
      expect(pressed("Day")).toBeTruthy()
    },
    week: (k) => {
      press("m")
      press(k)
      expect(pressed("Week")).toBeTruthy()
    },
    month: (k) => {
      press(k)
      expect(pressed("Month")).toBeTruthy()
    },
    agenda: (k) => {
      press(k)
      expect(pressed("Agenda")).toBeTruthy()
    },
    newEvent: async (k) => {
      press(k)
      await waitFor(() => expect(dialog.open).toBe(true))
    },
    open: (k) => {
      press(k, standupBlock())
      expect(dispatch).toHaveBeenCalledWith(opened("e1"))
    },
    duplicate: async (k) => {
      press(k, standupBlock())
      await waitFor(() => expect(dialog).toMatchObject({ open: true, initial: { title: "Standup" } }))
    },
    delete: async (k) => {
      press(k, standupBlock())
      await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ ...deleteEventConfirm({}), destructive: true })))
    },
    undo: async (k) => {
      await moveStandup()
      press(k)
      expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ startTime: nineOClock() }) }))
    },
    refresh: (k) => {
      press(k)
      expect(refetch).toHaveBeenCalledTimes(2)
    },
    search: (k) => {
      press(k)
      expect(screen.getByRole("textbox", { name: "Search events" })).toBeTruthy()
    },
  }

  for (const row of CALENDAR_KEYS) {
    for (const chord of [row.keys, ...(row.alt ?? [])]) {
      it(`${row.label}: ${chord}`, async () => {
        if (!row.command) {
          // Bound by what it acts on: ⌘⏎ by the event's forms (their own tests),
          // Alt and the arrows by the event's block, which they move.
          if (row.keys === "Mod-Enter") return
          expect(chord).toMatch(/^Alt-/)
          makeRequest.mockResolvedValue({})
          render(<CalendarApp />)
          press(chord, standupBlock())
          await waitFor(() => expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ title: "Standup" }) })))
          const { startTime, endTime } = makeRequest.mock.calls[0][0].payload
          const [k, mins] = [keyOf(chord), (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 60_000]
          const moved = { start: mins(nineOClock(), startTime), end: mins(iso(now.getDate(), 10), endTime) }
          const day = 24 * 60
          const want = { ArrowUp: -15, ArrowDown: 15, ArrowLeft: -day, ArrowRight: day }[k.key]!
          expect(moved).toEqual(k.shiftKey ? { start: 0, end: want } : { start: want, end: want })
          return
        }
        render(<CalendarApp />)
        await does[row.command](chord)
      })
    }
  }

  it("goes to the day typed into Go to", async () => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 9, 13, 9))
    render(<CalendarApp />)
    press("g")
    const field = await screen.findByRole("textbox", { name: "Go to a date" })
    fireEvent.change(field, { target: { value: "lunch" } })
    expect(screen.getByText("Try a day like next Friday or 15 Nov")).toBeTruthy()
    fireEvent.change(field, { target: { value: "15 Nov" } })
    expect(screen.getByText("Sunday 15 November 2026")).toBeTruthy()
    fireEvent.keyDown(field, { key: "Enter" })
    expect(title()).toContain("9 – 15 Nov 2026")
    expect(screen.queryByRole("textbox", { name: "Go to a date" })).toBeNull()
  })

  it("acts on the event whose card is open, from inside the card", async () => {
    render(<CalendarApp />)
    await showMonth()
    fireEvent.click(document.querySelector('[data-event-uuid="e1"]') as HTMLElement, { detail: 0 })
    press("e", await screen.findByRole("dialog", { name: "Standup" }))
    expect(dispatch).toHaveBeenCalledWith(opened("e1"))
  })

  it("acts on the agenda's row that has the focus", () => {
    render(<CalendarApp />)
    press("a")
    const row = document.querySelector<HTMLElement>('[data-agenda] [data-event-uuid="e1"]')!
    row.focus()
    press("e", row)
    expect(dispatch).toHaveBeenCalledWith(opened("e1"))
  })

  it("deletes once you confirm, and the event leaves the calendar", async () => {
    makeRequest.mockResolvedValue({})
    render(<CalendarApp />)
    press("Delete", standupBlock())
    await waitFor(() => expect(confirm).toHaveBeenCalled())
    await act(async () => {
      await confirm.mock.calls[0][0].onConfirm()
    })
    expect(makeRequest).toHaveBeenCalledWith(deleteEventRequest("e1"))
    const drop = refetch.mock.calls.find(([f]) => typeof f === "function")![0]
    expect(drop({ data: [standup()] })).toEqual({ data: [] })
  })

  it("says why it can't delete someone else's event, or a Google one", () => {
    events = [{ ...standup(), event_created_by: { user_uuid: "maya", user_name: "Maya" } }]
    render(<CalendarApp />)
    press("Backspace", standupBlock())
    expect(confirm).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Only its organiser can delete it" }))
  })

  it("says where an undone move went back to, and has nothing more to undo", async () => {
    render(<CalendarApp />)
    await moveStandup()
    press("z")
    await act(async () => {})
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Moved “Standup” back" }))
    makeRequest.mockClear()
    press("z")
    expect(makeRequest).not.toHaveBeenCalled()
  })

  it("shows the dot by the period while R asks again, and asks once till it answers", () => {
    refetch.mockReturnValue(new Promise(() => {}))
    render(<CalendarApp />)
    expect(screen.queryByRole("status")).toBeNull()
    press("r")
    expect(screen.getByRole("status").textContent).toBe("Loading…")
    press("r")
    expect(refetch).toHaveBeenCalledTimes(2)
  })

  it("stays out of the delete question and other dialogs over the calendar", () => {
    render(<CalendarApp />)
    const question = document.createElement("div")
    question.setAttribute("role", "alertdialog")
    const button = document.createElement("button")
    question.append(button)
    document.body.append(question)
    const before = title()
    press("j", button)
    press("Delete", button)
    expect(title()).toBe(before)
    expect(confirm).not.toHaveBeenCalled()
    question.remove()
  })
})

// VD-20, EV-58: a right-click on an event, or the menu key on its block.
describe("an event's menu", () => {
  const block = (uuid = "e1") => document.querySelector<HTMLElement>(`[data-calendar] [data-event-uuid="${uuid}"]`)!
  const menuOn = async (el: HTMLElement, at = { clientX: 320, clientY: 240 }) => {
    fireEvent.contextMenu(el, at)
    return screen.findByRole("menu")
  }
  const rows = (menu: HTMLElement) => within(menu).getAllByRole("menuitem").map((i) => i.textContent)
  const choose = (menu: HTMLElement, name: string) => fireEvent.click(within(menu).getByRole("menuitem", { name }))

  it("offers Open, Duplicate, Copy link and, for your own event, Delete", async () => {
    render(<CalendarApp />)
    expect(rows(await menuOn(block()))).toEqual(["Open", "Duplicate", "Copy link", "Delete"])
  })

  it("leaves Delete out for someone else's event", async () => {
    events = [{ ...standup(), event_created_by: { user_uuid: "maya", user_name: "Maya" } }]
    render(<CalendarApp />)
    expect(rows(await menuOn(block()))).toEqual(["Open", "Duplicate", "Copy link"])
  })

  it("leaves a task and empty time to the browser's own menu", () => {
    taskList = [{ task_uuid: "t1", task_name: "Ship the notes", task_start_date: iso(now.getDate(), 9), task_due_date: iso(now.getDate(), 17), task_status: "todo" }]
    render(<CalendarApp />)
    // Not taken: the browser shows its own menu.
    expect(fireEvent.contextMenu(block("t1"), { clientX: 10, clientY: 10 })).toBe(true)
    expect(fireEvent.contextMenu(document.querySelector("[data-day-col]")!, { clientX: 10, clientY: 10 })).toBe(true)
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("opens the event, and asks before deleting it", async () => {
    render(<CalendarApp />)
    choose(await menuOn(block()), "Open")
    expect(dispatch).toHaveBeenCalledWith({ type: "rightPanel/openRightPanel", payload: { eventUUID: "e1" } })
    choose(await menuOn(block()), "Delete")
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ ...deleteEventConfirm({}), destructive: true })))
  })

  it("duplicates it into the full dialog without its call link", async () => {
    events = [{ ...standup(), event_description: "Daily check-in\nhttps://meet.example.com/standup" }]
    render(<CalendarApp />)
    choose(await menuOn(block()), "Duplicate")
    await waitFor(() => expect(dialog).toMatchObject({ open: true, initial: { title: "Standup", description: "Daily check-in" } }))
  })

  it("copies the event's link", async () => {
    render(<CalendarApp />)
    choose(await menuOn(block()), "Copy link")
    expect(copy).toHaveBeenCalledWith(`${window.location.origin}/app/calendar/event/e1`, "Link copied")
  })

  // D16: a finger held on an event and let go without moving opens the same menu.
  it("opens when a finger is held on the event and let go without moving", async () => {
    installPointerEvent()
    render(<CalendarApp />)
    const b = block()
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: TEST_TODAY })
    try {
      fireEvent.pointerDown(b, { button: 0, pointerType: "touch", clientX: 10, clientY: 10 })
      act(() => void vi.advanceTimersByTime(260))
      fireEvent.pointerUp(b.closest("[data-day-col]")!.parentElement!, { pointerType: "touch", clientX: 10, clientY: 10 })
    } finally {
      vi.useRealTimers()
    }
    expect(rows(await screen.findByRole("menu"))).toEqual(["Open", "Duplicate", "Copy link", "Delete"])
  })

  it("opens from the keyboard, with no pointer, on the block that has the focus", async () => {
    render(<CalendarApp />)
    const b = block()
    b.focus()
    expect(rows(await menuOn(b, { clientX: 0, clientY: 0 }))).toContain("Open")
  })
})

// PTC-14: on a phone the calendar's own controls were 28 to 32 px. Base
// buttons take a 44 px tap themselves (data-touch-target, app/phone.css F3);
// the calendar's own controls opt in, and rows stacked edge to edge grow.
describe("under a finger", () => {
  it("gives the phone's day strip and views a 44 px tap", () => {
    mobile = true
    render(<CalendarApp />)
    const own = Array.from(document.querySelectorAll("[data-week-strip] button, [data-phone-bar] [data-calendar-views] button"))
    expect(own).toHaveLength(10)
    for (const b of own) expect(b.hasAttribute("data-touch-target")).toBe(true)
  })

  it("gives the computer's views one too, and grows the calendars' rows", async () => {
    render(<CalendarApp />)
    for (const b of document.querySelectorAll("[data-calendar-views] button")) expect(b.hasAttribute("data-touch-target")).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: /Calendars/ }))
    await screen.findByRole("checkbox", { name: "Personal" })
    const rows = document.querySelectorAll("[data-calendar-row]")
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) expect(r.className).toContain("pointer-coarse:h-11")
  })
})

// FE-F-1: the calendar asked for 100 of the month's tasks.
describe("a month with many tasks", () => {
  it("shows every one of 250", () => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 9, 1, 9))
    taskList = Array.from({ length: 250 }, (_, i) => {
      const due = new Date(2026, 9, 1 + (i % 30), 17).toISOString()
      return { task_uuid: `t${i}`, task_name: `Task ${i}`, task_start_date: due, task_due_date: due, task_status: "todo" }
    })
    render(<CalendarApp />)
    // The month grid's range, all of it (useAssignedTasks reads it page by page).
    expect(taskRange).toBe(`startDate=${new Date(2026, 8, 28).toISOString()}&endDate=${new Date(2026, 10, 1, 23, 59, 59, 999).toISOString()}`)
    fireEvent.click(screen.getByRole("button", { name: "Agenda" }))
    expect(document.querySelectorAll('[data-agenda] [data-event-uuid^="t"]')).toHaveLength(250)
  })
})

// Calendar A7: a moved or deleted instance of a repeating event asks which of
// the series it is for (D-CAL-6), and goes through the calendar's own API.
describe("an instance of a repeating event", () => {
  const instance = "6f1c2a9e-3b7d-4c5e-9a1f-2b3c4d5e6f70_20261013T080000Z"
  beforeEach(() => {
    repeatsOn = true
    events = [{ ...standup(), event_uuid: instance }]
  })
  afterEach(() => {
    repeatsOn = false
  })

  it("asks which events a drag moves, and moves those at the version read", async () => {
    makeRequest.mockImplementation(async (req: { method?: string }) => (req.method === "GET" ? { id: instance, sequence: 2, all_day: false } : {}))
    render(<CalendarApp />)
    dragFirstEventTwoHours()
    fireEvent.click(await screen.findByRole("radio", { name: "All events" }))
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }))
    })
    await waitFor(() => expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({ method: "PATCH" })))
    const patch = makeRequest.mock.calls.find(([r]) => r.method === "PATCH")![0]
    expect(patch).toMatchObject({ apiEndpoint: "/calendar/events", appendToUrl: `/${instance}` })
    expect(patch.payload).toMatchObject({ sequence: 2, scope: "all", start: { at: iso(now.getDate(), 11) }, end: { at: iso(now.getDate(), 12) } })
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Moved “Standup”", description: "Every event in the series moved with it." })))
  })

  it("moves nothing when the question is closed", async () => {
    render(<CalendarApp />)
    dragFirstEventTwoHours()
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Cancel" }))
    })
    expect(makeRequest).not.toHaveBeenCalled()
  })

  it("asks which events Delete takes, in place of the plain question", async () => {
    makeRequest.mockResolvedValue({})
    render(<CalendarApp />)
    const block = document.querySelector<HTMLElement>(`[data-calendar] [data-event-uuid="${instance}"]`)!
    block.focus()
    act(() => void fireEvent.keyDown(block, { key: "Delete" }))
    await screen.findByRole("radio", { name: "This event" })
    expect(confirm).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    })
    expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({ method: "DELETE", apiEndpoint: "/calendar/events", appendToUrl: `/${instance}?scope=this` }))
  })
})
