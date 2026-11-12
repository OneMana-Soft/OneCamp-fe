import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { OWN_HUE, otherHue } from "@/components/calendar/calendarTones"

// What the calendar asks the server for, by URL, and what each answers.
const asked: string[] = []
let connected = false
let account = ""
// Where the person's sync with Google stands (calendar C9), as /calendar/sync/google answers.
let syncState: string | undefined
// And Outlook's (B7), as /calendar/sync/microsoft answers: read whether or not it's linked.
let outlookState: string | undefined
// Whether the person linked their own Outlook, as GET /connectors says (read once Outlook is available).
let outlookLinked = false
let loading = false
let failing = false
// The calendars beside yours: one listed, and their events' read failing (F2).
// The same answers each time, as SWR gives: a new error each render would
// tell the calendar something changed, again and again.
let othersFailing = false
const othersListed = { data: { data: [{ id: "c1", name: "Launch", kind: "project", access: "view" }] }, isLoading: false, mutate: () => {} }
const othersDown = { data: undefined, isLoading: false, isError: new Error("500"), mutate: () => {} }
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
const NO_REPEATS = { data: undefined, isLoading: false, mutate: vi.fn() }
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    asked.push(url)
    if (loading && (url.includes("/event/getEvents") || url.includes("assignedTaskList"))) return { data: undefined, isLoading: true, mutate: refetch }
    if (othersFailing && url === "/calendar/calendars") return othersListed
    if (othersFailing && url.startsWith("/calendar/calendars/events")) return othersDown
    if (failing && url.includes("/event/getEvents")) return { data: undefined, isLoading: false, isError: new Error("502"), mutate: refetch }
    if (url.includes("/event/getEvents")) return { data: { data: events ?? (free ? [] : [standup()]) }, isLoading: false, mutate: refetch }
    if (url.includes("assignedTaskList")) return { data: { data: { user_tasks: taskList } }, isLoading: false, mutate: refetch }
    // What repeats (head 9) has its own spec (e2e/calendarRepeats): nothing here, kept like SWR keeps it.
    if (url.startsWith("/calendar/repeats")) return NO_REPEATS
    if (url.includes("bookingPages")) return { data: { data: [{}, {}] }, isLoading: false, mutate: vi.fn() }
    if (url.includes("/calendar/sync/google")) return { data: syncState ? { data: { state: syncState } } : undefined, isLoading: false, mutate: vi.fn() }
    if (url === "/connectors") return { data: { data: { connectors: [{ id: "microsoft_calendar", connected: outlookLinked }] } }, isLoading: false, mutate: vi.fn() }
    if (url.includes("/calendar/sync/microsoft")) return { data: { data: { state: outlookState ?? "none", available: !!outlookState } }, isLoading: false, mutate: vi.fn() }
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
// The shared Undo toast (components/ui/undoToast) says through the app's own toast, not the hook's.
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast: (...t: unknown[]) => toast(...t) }))
const confirm = vi.fn()
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: mobile, isDesktop: !mobile }) }))
const dispatch = vi.fn()
// What the right panel shows: the calendar reads which event is open beside it.
let panel = { isOpen: false, data: { eventUUID: "" } }
vi.mock("react-redux", () => ({ useDispatch: () => dispatch, useSelector: (pick: (s: unknown) => unknown) => pick({ rightPanel: { rightPanelState: panel } }) }))
const copy = vi.fn()
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copy }), copyToClipboard: copy }))
// The calendar's Trash, a chunk of its own (components/calendar/calendarTrash.test.tsx has its sheet).
vi.mock("@/components/calendar/calendarTrash", () => ({ CalendarTrash: () => <p>The Trash, open</p> }))
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
import { choose } from "@/lib/calendar/choices"
import { deleteEventRequest } from "@/lib/calendar/confirmDelete"
import { installPointerEvent } from "@/lib/testing/pointerEvent"
import { pinTestClock, TEST_TODAY } from "@/lib/testing/testClock"

// Today is TEST_TODAY wherever the code under test reads the time.
pinTestClock()

// The surfaces the calendar loads on first use, loaded once for the file:
// a first dynamic import can take more than a second on a busy machine.
beforeAll(async () => {
  await Promise.all([import("./calendarsPopover"), import("./goToDate"), import("./eventMenu"), import("./eventPopover"), import("./scopePromptDialog"), import("./seriesChanges"), import("./tellGuestsDialog"), import("./undoToast"), import("@/components/ui/undoToast")])
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
  syncState = undefined
  outlookState = undefined
  outlookLinked = false
  toast.mockReset()
  loading = false
  failing = false
  othersFailing = false
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
/** The agenda is a chunk of its own too: listed once its code is in. */
const agendaShown = () => waitFor(() => expect(document.querySelector("[data-agenda]")).toBeTruthy())
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

  it("asks before disconnecting Google Calendar, then unlinks it and takes its events off at once", async () => {
    connected = true
    render(<CalendarApp />)
    fireEvent.click(screen.getByRole("button", { name: /Calendars/ }))
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect Google Calendar" }))
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: "Disconnect Google Calendar?", destructive: true }))
    expect(makeRequest).not.toHaveBeenCalled()
    await act(async () => {
      await confirm.mock.calls[0][0].onConfirm()
    })
    expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({ apiEndpoint: "/integration/google-calendar/unlink" }))
    // Google's events leave the calendar's copy before it is read again.
    const drop = refetch.mock.calls.find((c) => typeof c[0] === "function")
    expect(drop?.[0]({ data: [{ event_uuid: "gcal-1" }, { event_uuid: "e1" }] })).toEqual({ data: [{ event_uuid: "e1" }] })
    expect(drop?.[1]).toEqual({ revalidate: true })
  })

  // B7: the confirm a panel row asks (Disconnect Google or Outlook, Remove calendar) is an alertdialog in a portal of
  // its own, which takes the focus and the press. The panel stays behind it, so it shows what the confirmed step did
  // (Connect is back), as an event card does (overlayFocus.stayBehindConfirm); anywhere else still closes it.
  it("keeps the Calendars panel open behind the confirm one of its rows asks", async () => {
    connected = true
    render(<CalendarApp />)
    fireEvent.click(screen.getByRole("button", { name: /Calendars/ }))
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect Google Calendar" }))
    const ask = document.body.appendChild(document.createElement("div"))
    ask.setAttribute("role", "alertdialog")
    const yes = ask.appendChild(document.createElement("button"))
    act(() => yes.focus())
    fireEvent.pointerDown(yes)
    await act(async () => {})
    expect(screen.getByRole("checkbox", { name: "Personal" })).toBeTruthy()
    ask.remove()
    act(() => screen.getByRole("button", { name: "Month" }).focus())
    await waitFor(() => expect(screen.queryByRole("checkbox", { name: "Personal" })).toBeNull())
  })

  it("has one primary action, New event", () => {
    render(<CalendarApp />)
    const primaries = screen.getAllByRole("button").filter((b) => /\bbg-brand\b/.test(b.className))
    expect(primaries.map((b) => b.textContent)).toEqual(["New eventC"])
  })

  // Integration review, 12 Oct: at 768 beside the rail the header's title was
  // cut to "12–18 …". Under 57rem of header New event keeps its plus alone
  // (46rem until the fifth view, Year, made the actions wider: V-43).
  it("folds New event to its plus under 57rem of header, still named New event", () => {
    render(<CalendarApp />)
    const add = document.querySelector("[data-new-event]") as HTMLElement
    expect(add.getAttribute("aria-label")).toBe("New event")
    expect(add.className).toContain("@max-[57rem]/calhead:w-8")
    const words = Array.from(add.querySelectorAll("span")).find((s) => s.textContent === "New event") as HTMLElement
    expect(words.className).toBe("hidden @[57rem]/calhead:inline")
  })

  it("switches views with five buttons over one sliding thumb, asking for nothing new", () => {
    render(<CalendarApp />)
    const first = ranges()
    expect(views().map((b) => b.textContent).sort()).toEqual(["Agenda", "Day", "Month", "Week", "Year"])
    expect(document.querySelectorAll("[data-calendar-views] [data-thumb]")).toHaveLength(1)
    expect(screen.getByRole("button", { name: "Week", pressed: true })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Month" }))
    const thumb = document.querySelector("[data-thumb]") as HTMLElement
    // Whole segments: 64 px each, 52 under 52rem of header, where the search (/
    // opens it) steps aside, so the period stays whole; under 46rem (the panel
    // open at 1280) each says its initial, its key (calendar.css), its name
    // still its own.
    expect(thumb.style.transform).toBe("translateX(calc(var(--seg) * 2))")
    expect(document.querySelector("[data-calendar-views]")!.className).toMatch(/\[--seg:64px\] @max-\[52rem\]\/calhead:\[--seg:52px\]/)
    expect(screen.getByRole("button", { name: "Search events" }).className).toMatch(/@max-\[52rem\]\/calhead:hidden/)
    expect(views().map((b) => b.querySelector(".calendar-view-name")?.textContent)).toEqual(views().map((b) => b.textContent))
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

  // F2's follow-up (DESIGN-BUILD-8): a failed read of the calendars beside
  // yours is partial data. Your week stays drawn and live, and one row says
  // their times are missing, never that they're free.
  it("keeps your week when only the calendars beside yours couldn't be read, and says so in one row", async () => {
    othersFailing = true
    render(<CalendarApp />)
    await showMonth()
    const words = await screen.findByText("Couldn't load the calendars beside yours, so their busy times aren't shown.")
    expect(words.closest("[role=status]")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy()
    expect(document.querySelector("[data-calendar-failed]")).toBeNull()
    expect(document.querySelector('[data-event-uuid="e1"]')).toBeTruthy()
  })

  it("says a failure of your calendar and theirs once, as your calendar's", async () => {
    failing = true
    othersFailing = true
    render(<CalendarApp />)
    await waitFor(() => expect(asked.some((u) => u.startsWith("/calendar/calendars/events"))).toBe(true))
    await act(async () => {})
    expect(screen.getByRole("heading", { name: "Couldn't load your calendar" })).toBeTruthy()
    expect(screen.queryByText(/so their busy times aren't shown/)).toBeNull()
  })

  it("colours a personal event by its calendar", async () => {
    render(<CalendarApp />)
    await showMonth()
    const bar = document.querySelector('[data-event-uuid="e1"]') as HTMLElement
    expect(bar.getAttribute("data-hue")).toBe("sun")
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
    expect(screen.getByRole("button", { name: "Agenda", pressed: true })).toBeTruthy()
    expect(document.querySelectorAll("[data-week-strip] button")).toHaveLength(7)
    expect(screen.getByRole("button", { name: "New event" })).toBeTruthy()
  })

  // The week strip carries the arrows on a phone, and the month view hides
  // the strip: a month on a phone had no way to the next one.
  it("pages a phone's month view by month", () => {
    mobile = true
    render(<CalendarApp />)
    fireEvent.click(screen.getByRole("button", { name: "Month" }))
    const title = () => document.querySelector("[data-period-title]")?.textContent ?? ""
    const before = title()
    fireEvent.click(screen.getByRole("button", { name: "Next month" }))
    expect(title()).not.toBe(before)
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }))
    expect(title()).toBe(before)
    fireEvent.click(screen.getByRole("button", { name: "Agenda" }))
    expect(screen.queryByRole("button", { name: "Next month" })).toBeNull()
  })

  // Under a finger each arrow reaches 8px past its 28px box (app/phone.css F3),
  // and the later one is on top. Side by side, Next month's reach covered the
  // right 8px of Previous month: a tap there (Chromium, touch emulation) went
  // to the next month. 16px apart, the two reaches only meet.
  it("keeps a phone's month arrows' reaches apart", () => {
    mobile = true
    render(<CalendarApp />)
    fireEvent.click(screen.getByRole("button", { name: "Month" }))
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
    expect(periodTitles("year", d)).toEqual(["2026"])
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
  it("pages by what it listed, so no day is ever skipped", async () => {
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
    await agendaShown()
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
  // C9, DESIGN-BUILD-8: while Google has stopped answering, the closed
  // Calendars button carries a danger dot, and its name says so.
  it("marks the closed Calendars button while Google needs connecting again", () => {
    connected = true
    syncState = "broken"
    render(<CalendarApp />)
    const button = screen.getByRole("button", { name: "Calendars, Google needs connecting again" })
    expect(button.querySelector("[data-sync-broken]")).toBeTruthy()
  })

  // B7: Outlook's link breaks the same way, and the same dot and words say so.
  it("marks the closed Calendars button while Outlook, or both, need connecting again", () => {
    outlookState = "broken"
    outlookLinked = true
    const { unmount } = render(<CalendarApp />)
    expect(screen.getByRole("button", { name: "Calendars, Outlook needs connecting again" }).querySelector("[data-sync-broken]")).toBeTruthy()
    unmount()
    connected = true
    syncState = "broken"
    render(<CalendarApp />)
    expect(screen.getByRole("button", { name: "Calendars, Google and Outlook need connecting again" }).querySelector("[data-sync-broken]")).toBeTruthy()
  })

  // CR-B22 F1: a person's own Disconnect leaves Outlook's sync "broken" (the next sweep finds no token), and
  // nothing is to be connected again: only a linked provider's broken link is said. A token Microsoft revoked
  // keeps its connector row, so that one still says so (above).
  it("says nothing of Outlook's broken sync once the person disconnected it", () => {
    outlookState = "broken"
    outlookLinked = false
    render(<CalendarApp />)
    const button = screen.getByRole("button", { name: "Calendars" })
    expect(button.querySelector("[data-sync-broken]")).toBeNull()
  })

  it("leaves the Calendars button plain while each sync is in step, or Google isn't connected", () => {
    syncState = "broken"
    const { unmount } = render(<CalendarApp />)
    expect(screen.getByRole("button", { name: "Calendars" }).querySelector("[data-sync-broken]")).toBeNull()
    expect(asked.some((u) => u.includes("/calendar/sync/google"))).toBe(false)
    unmount()
    connected = true
    syncState = "synced"
    outlookState = "synced"
    render(<CalendarApp />)
    expect(screen.getByRole("button", { name: "Calendars" }).querySelector("[data-sync-broken]")).toBeNull()
  })

  // DESIGN-BUILD-118 F2: the closed button's colours are those the grid draws: your own, and Google's
  // events in Google's. Outlook's move brings calendars of your own, each in its own hue under My calendars,
  // so Outlook has no dot of its own (otherHue("microsoft") was Google's dusk, a colour no calendar on show used).
  it("draws your own dot and Google's, and no second dot of the same hue once Outlook is linked too", () => {
    const dots = () => [...screen.getByRole("button", { name: "Calendars" }).querySelectorAll("[data-calendar-dots] [data-hue]")].map((d) => d.getAttribute("data-hue"))
    const { unmount } = render(<CalendarApp />)
    expect(dots()).toEqual([OWN_HUE])
    unmount()
    connected = true
    outlookState = "synced"
    outlookLinked = true
    render(<CalendarApp />)
    expect(dots()).toEqual([OWN_HUE, otherHue("google")])
    expect(new Set(dots()).size).toBe(dots().length)
  })

  it("says which Google account is connected", async () => {
    connected = true
    account = "maya@gmail.com"
    render(<CalendarApp />)
    fireEvent.click(screen.getByRole("button", { name: /Calendars/ }))
    expect((await screen.findByText("maya@gmail.com")).hasAttribute("data-google-account")).toBe(true)
  })

  it("says so on coming back from Google, and drops the answer from the address", async () => {
    connected = true
    account = "maya@gmail.com"
    window.history.replaceState({}, "", "/app/calendar?connector=success&provider=google_calendar")
    await act(async () => {
      render(<CalendarApp />)
    })
    // Said by a chunk of its own, once it is in.
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Google Calendar is connected", description: "Connected as maya@gmail.com." })))
    expect(window.location.search).toBe("")
  })

  it("says when the sign-in didn't finish", async () => {
    window.history.replaceState({}, "", "/app/calendar?connector=error")
    await act(async () => {
      render(<CalendarApp />)
    })
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't connect Google Calendar", variant: "destructive" })))
    expect(window.location.search).toBe("")
  })
})


// FE-F-2: the date and the view weren't in the address, so a reload or Back
// lost them and no link could point at a day.
describe("the calendar's address", () => {
  const title = () => document.querySelector("[data-calendar-header] [data-period-title]")?.textContent ?? ""
  const on13Oct = () => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
    vi.setSystemTime(new Date(2026, 9, 13, 9))
  }
  // The address is written once the place has been still for a second (fluid-10).
  const settle = () => act(() => void vi.advanceTimersByTime(1000))

  it("opens on the day and the view it names", () => {
    window.history.replaceState({}, "", "/app/calendar?date=2026-11-05&view=month")
    render(<CalendarApp />)
    expect(screen.getByRole("button", { name: "Month", pressed: true })).toBeTruthy()
    expect(title()).toContain("November 2026")
  })

  it("says the day, and then the view, once each has settled, and nothing on opening", () => {
    on13Oct()
    render(<CalendarApp />)
    settle()
    expect(window.location.search).toBe("")
    act(() => void fireEvent.keyDown(window, { key: "j" }))
    act(() => void fireEvent.keyDown(window, { key: "j" }))
    // Not while it moves: J twice is one write, of where it stopped.
    expect(window.location.search).toBe("")
    settle()
    expect(window.location.search).toBe("?date=2026-10-27")
    fireEvent.click(screen.getByRole("button", { name: "Month" }))
    settle()
    expect(window.location.search).toBe("?date=2026-10-27&view=month")
    expect(window.location.pathname).toBe("/app/calendar")
  })

  it("writes where it is at once when the page is left before it settles", () => {
    on13Oct()
    render(<CalendarApp />)
    act(() => void fireEvent.keyDown(window, { key: "j" }))
    expect(window.location.search).toBe("")
    act(() => void window.dispatchEvent(new Event("pagehide")))
    expect(window.location.search).toBe("?date=2026-10-20")
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
    settle()
    expect(window.location.search).toBe("?date=2026-10-13&event=e1")
    panel = { isOpen: false, data: { eventUUID: "e1" } }
    rerender(<CalendarApp />)
    settle()
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

  // CAL-40: a delete's Open Trash from the event's panel or page (lib/calendar/deleteEvent trashRoute).
  it("opens its Trash when the address asks, and takes the ask out of the address", async () => {
    window.history.replaceState({}, "", "/app/calendar?date=2026-10-13&trash=1&view=day")
    render(<CalendarApp />)
    expect(await screen.findByText("The Trash, open")).toBeTruthy()
    expect(window.location.search).toBe("?date=2026-10-13&view=day")
  })

  // CR-250 F5: the panel's Open Trash pushes ?trash=1 while the calendar is already open beside it.
  it("opens its Trash when the address asks while it is open, and takes the ask out again", async () => {
    window.history.replaceState({}, "", "/app/calendar?date=2026-10-13&view=day")
    const { rerender } = render(<CalendarApp />)
    expect(screen.queryByText("The Trash, open")).toBeNull()
    window.history.replaceState({}, "", "/app/calendar?date=2026-10-13&view=day&trash=1")
    rerender(<CalendarApp />)
    expect(await screen.findByText("The Trash, open")).toBeTruthy()
    expect(window.location.search).toBe("?date=2026-10-13&view=day")
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
  // A move sends once its own chunk is in (seriesChanges): moved when its toast says so.
  const moveStandup = async () => {
    makeRequest.mockResolvedValue({})
    dragFirstEventTwoHours()
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Moved “Standup”" })))
    makeRequest.mockClear()
  }
  // The old stores' question before a delete (lib/calendar/confirmDelete): it never says it can't be undone (CAL-40).
  const asksToDelete = expect.objectContaining({ title: "Delete “Standup”?", description: "It's removed from everyone's calendar.", destructive: true })

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
    custom: (k) => {
      press(k)
      // Google's custom view: four days from the date, stepped four at a time.
      expect(screen.getByRole("button", { name: "Next 4 days" })).toBeTruthy()
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
    year: (k) => {
      press(k)
      expect(pressed("Year")).toBeTruthy()
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
      await waitFor(() => expect(confirm).toHaveBeenCalledWith(asksToDelete))
    },
    undo: async (k) => {
      await moveStandup()
      press(k)
      await waitFor(() => expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ startTime: nineOClock() }) })))
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
          // A burst of them goes a second after the last (D-1).
          vi.useRealTimers()
          vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: TEST_TODAY })
          try {
            press(chord, standupBlock())
            act(() => void vi.advanceTimersByTime(1000))
          } finally {
            vi.useRealTimers()
            vi.setSystemTime(TEST_TODAY)
          }
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

  it("acts on the agenda's row that has the focus", async () => {
    render(<CalendarApp />)
    press("a")
    await agendaShown()
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
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: "Delete “Standup”?", destructive: true })))
  })

  it("duplicates it into the full dialog without its call link", async () => {
    events = [{ ...standup(), event_description: "Daily check-in\nhttps://meet.example.com/standup" }]
    render(<CalendarApp />)
    choose(await menuOn(block()), "Duplicate")
    await waitFor(() => expect(dialog).toMatchObject({ open: true, initial: { title: "Standup", description: "Daily check-in" } }))
  })

  // Calendar head B (gcal-1a): a copy keeps its own colour, and the files the copier may open; the rest it says.
  it("duplicates its own colour and the files you can open, and says which it left off", async () => {
    events = [{ ...standup(), event_calendar_id: "cal-sam", event_hue: "#1a73e8" }]
    const files = [{ kind: "doc", uuid: "d-brief" }, { kind: "board", uuid: "b-plan" }]
    makeRequest.mockImplementation(async (req: { method?: string; payload?: { refs?: Array<{ kind: string; id: string }> } }) =>
      req.method === "GET" ? { id: "e1", files } : (req.payload?.refs ?? []).map((r) => ({ ...r, access: r.id === "d-brief" ? "ok" : "none" })),
    )
    render(<CalendarApp />)
    choose(await menuOn(block()), "Duplicate")
    await waitFor(() => expect(dialog).toMatchObject({ open: true, initial: { title: "Standup", hue: "#1a73e8", files: [{ kind: "doc", uuid: "d-brief" }] } }))
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Copied without 1 file", description: "You can't open it, so the copy leaves it off." }))
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
    // The strip's seven days, and the switch's Agenda, Day, Month and Year.
    expect(own).toHaveLength(11)
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
  it("shows every one of 250", async () => {
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
    await agendaShown()
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
    // Asked once the move's chunk is in: found outside act, which holds React's renders till it ends.
    const cancel = await screen.findByRole("button", { name: "Cancel" })
    await act(async () => {
      fireEvent.click(cancel)
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

// B1's view options: Google's custom view and its view settings, by the switch.
describe("the view options", () => {
  afterEach(() => act(() => choose(() => ({ view: { span: "4d", density: "comfortable", weekends: true, weekNumbers: false, weekStartsOn: 1 } }))))

  it("show the custom length chosen there, live, and name it on their button", async () => {
    render(<CalendarApp />)
    fireEvent.click(screen.getByRole("button", { name: "View options" }))
    const days = await screen.findByRole("radiogroup", { name: "Custom view in days" })
    fireEvent.click(within(days).getByRole("radio", { name: "5" }))
    expect(screen.getByRole("button", { name: "Next 5 days" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "View options", pressed: true }).textContent).toContain("5 days")
  })

  it("hide the weekend from the week, and number the weeks", () => {
    render(<CalendarApp />)
    expect(document.querySelectorAll("[data-weekend]").length).toBeGreaterThan(0)
    act(() => choose((c) => ({ view: { ...c.view, weekends: false, weekNumbers: true } })))
    expect(document.querySelectorAll("[data-weekend]")).toHaveLength(0)
    expect(document.querySelector("[data-week-number]")?.textContent).toMatch(/^W\d+$/)
  })

  it("draw the week's hour compact from Density, live behind them", async () => {
    render(<CalendarApp />)
    const hour = () => document.querySelector<HTMLElement>('[data-calendar] [style*="--cal-hour"]')?.style.getPropertyValue("--cal-hour")
    expect(hour()).toBe("56px")
    fireEvent.click(screen.getByRole("button", { name: "View options" }))
    const density = await screen.findByRole("radiogroup", { name: "Density" })
    fireEvent.click(within(density).getByRole("radio", { name: "Compact" }))
    expect(hour()).toBe("40px")
    // Still open: a keyboard goes on through the choices.
    expect(screen.getByRole("radiogroup", { name: "Density" })).toBeTruthy()
  })

  it("print the view as drawn, alone on the page, once they have closed", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {})
    render(<CalendarApp />)
    // The calendar is what prints (globals.css: a print root prints alone),
    // and the boxes around it carry the mark the print rules key on.
    const calendar = document.querySelector("[data-calendar]")!
    expect(calendar.hasAttribute("data-print-root")).toBe(true)
    expect(calendar.parentElement?.hasAttribute("data-print-path")).toBe(true)
    expect(document.documentElement.hasAttribute("data-print-path")).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "View options" }))
    fireEvent.click(await screen.findByRole("button", { name: "Print" }))
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole("radiogroup", { name: "Density" })).toBeNull()
  })
})

// B1's Year (Google's, Y or 6): the year's twelve months, from its own key and
// its switch's segment; a day there opens its day, a month's name its month,
// and the year asks for itself once.
describe("the year", () => {
  it("opens on Y, asks for its year, and a day there opens its day", async () => {
    render(<CalendarApp />)
    act(() => void fireEvent.keyDown(window, { key: "y" }))
    await waitFor(() => expect(document.querySelector("[data-year]")).toBeTruthy())
    expect(document.querySelectorAll("[data-year-month]")).toHaveLength(12)
    expect(screen.getByRole("button", { name: "Year", pressed: true })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Next year" })).toBeTruthy()
    const year = TEST_TODAY.getFullYear()
    await waitFor(() => expect([...ranges()].some((u) => u.includes(`startDate=${new Date(year, 0, 1).toISOString()}`) && u.includes(`endDate=${new Date(year, 11, 31, 23, 59, 59, 999).toISOString()}`))).toBe(true))
    fireEvent.click(document.querySelector(`[data-year-day="${year}-03-04"]`) as HTMLElement)
    await waitFor(() => expect(document.querySelector("[data-period]")?.getAttribute("data-period")).toBe(`day:${year}-03-04`))
  })

  it("opens a month from its name", async () => {
    render(<CalendarApp />)
    act(() => void fireEvent.keyDown(window, { key: "6" }))
    await waitFor(() => expect(document.querySelector("[data-year]")).toBeTruthy())
    fireEvent.click(within(document.querySelector('[data-year-month="7"]') as HTMLElement).getByRole("button", { name: "July" }))
    await waitFor(() => expect(document.querySelector("[data-month-grid]")).toBeTruthy())
    expect(screen.getByRole("button", { name: "Month", pressed: true })).toBeTruthy()
  })
})

// gcal-new-task-blocks: a task carried from the all-day lane onto the hours is
// a block of its time, made through the one create (POST /calendar/events),
// which names it for the task.
describe("a task carried onto the hours", () => {
  it("blocks an hour of its time through the one create", async () => {
    taskList = [{ task_uuid: "t9", task_name: "Write the brief", task_due_date: iso(now.getDate(), 17), task_status: "todo" }]
    makeRequest.mockResolvedValue({ id: "b1", title: "Write the brief" })
    render(<CalendarApp />)
    installPointerEvent()
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const col = this.dataset?.dayCol
      const left = col !== undefined ? 56 + Number(col) * 100 : 56
      return { left, right: left + (col !== undefined ? 100 : 700), top: 0, bottom: 24 * 56, width: col !== undefined ? 100 : 700, height: 24 * 56, x: left, y: 0, toJSON: () => ({}) } as DOMRect
    })
    const chip = document.querySelector('[data-all-day-rail] [aria-label^="Task: Write the brief"]') as HTMLElement
    const hours = document.querySelector('[data-day-col="0"]')!.parentElement as HTMLElement
    fireEvent.pointerDown(chip, { button: 0, pointerId: 1, clientX: 106, clientY: 5 })
    fireEvent.pointerMove(hours, { pointerId: 1, clientX: 106, clientY: 10 * 56 })
    await act(async () => {
      fireEvent.pointerUp(hours, { pointerId: 1, clientX: 106, clientY: 10 * 56 })
    })
    await waitFor(() => expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", apiEndpoint: "/calendar/events" })))
    const { payload } = makeRequest.mock.calls.find(([r]) => r.method === "POST")![0]
    expect(payload).toMatchObject({ kind: "task_block", task_uuid: "t9", title: "" })
    const start = new Date(payload.start.at)
    expect([start.getHours(), start.getMinutes(), (new Date(payload.end.at).getTime() - start.getTime()) / 60000]).toEqual([9, 30, 60])
  })
})

// Block time from a slot: quick create's task goes through the same block
// write as the lane's carry (blockTime), with the title the card was given.
describe("block time from a slot", () => {
  beforeEach(() => {
    repeatsOn = true
  })
  afterEach(() => {
    repeatsOn = false
  })

  it("makes the block through the one create, at the slot pressed", async () => {
    taskList = [{ task_uuid: "t9", task_name: "Write the brief", task_due_date: iso(now.getDate(), 17), task_status: "todo", task_project: { project_uuid: "p1", project_name: "Launch" } }]
    makeRequest.mockResolvedValue({ id: "b2", title: "Write the brief" })
    render(<CalendarApp />)
    installPointerEvent()
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const col = this.dataset?.dayCol
      const left = col !== undefined ? 56 + Number(col) * 100 : 56
      return { left, right: left + (col !== undefined ? 100 : 700), top: 0, bottom: 24 * 56, width: col !== undefined ? 100 : 700, height: 24 * 56, x: left, y: 0, toJSON: () => ({}) } as DOMRect
    })
    const col = document.querySelector('[data-day-col="0"]') as HTMLElement
    fireEvent.pointerDown(col, { button: 0, pointerId: 1, clientX: 106, clientY: 14 * 56 + 5 })
    await act(async () => {
      fireEvent.pointerUp(col.parentElement as HTMLElement, { pointerId: 1, clientX: 106, clientY: 14 * 56 + 5 })
    })
    fireEvent.click(await screen.findByRole("button", { name: "Block time for a task" }, { timeout: 3000 }))
    fireEvent.click(await screen.findByRole("option", { name: /Write the brief/ }, { timeout: 3000 }))
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }))
    await waitFor(() => expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", apiEndpoint: "/calendar/events" })))
    const { payload } = makeRequest.mock.calls.find(([r]) => r.method === "POST")![0]
    expect(payload).toMatchObject({ kind: "task_block", task_uuid: "t9", title: "" })
    expect(new Date(payload.start.at).getHours()).toBe(14)
  })
})

// CAL-11, CAL-40 (UX-CALPLAN H1): on the one store, a move or a delete on the
// grid asks what the Event Form asks before guests hear of it (D-CAL-5),
// sends an event's times alone at the version it read, and a delete goes to
// the Trash with Undo, never "This can't be undone".
describe("moves and deletes on the one store", () => {
  const meeting = () => ({ ...standup(), event_title: "Design review", event_guests: [{ email: "alex@example.com", role: "required", response: "needs_action" }] })
  const nineOClock = () => iso(now.getDate(), 9)
  const block = () => document.querySelector<HTMLElement>('[data-calendar] [data-event-uuid="e1"]')!
  /** The calendar's own API: the event at sequence 3; every write done. */
  const server = () => makeRequest.mockImplementation(async (req: { method?: string }) => (req.method === "GET" ? { id: "e1", sequence: 3, all_day: false } : {}))
  const sentWith = (method: string) => makeRequest.mock.calls.map(([r]) => r).filter((r) => r.method === method)
  const tellGuests = () => screen.findByRole("dialog", { name: "Send an update to your guests?" })
  beforeEach(() => {
    repeatsOn = true
  })
  afterEach(() => {
    repeatsOn = false
  })

  it("a drag of a meeting with guests asks Tell guests? and sends notify none on Don't send", async () => {
    events = [meeting()]
    server()
    render(<CalendarApp />)
    dragFirstEventTwoHours()
    const ask = await tellGuests()
    expect(makeRequest).not.toHaveBeenCalled()
    await act(async () => void fireEvent.click(within(ask).getByRole("button", { name: "Don't send" })))
    await waitFor(() => expect(sentWith("PATCH")).toHaveLength(1))
    expect(sentWith("PATCH")[0].payload).toMatchObject({ notify: "none" })
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Moved “Design review”", description: expect.stringMatching(/Guests weren't emailed\.$/) })))
  })

  it("a drag patches only the new times, at the version it read", async () => {
    server()
    render(<CalendarApp />)
    dragFirstEventTwoHours()
    await waitFor(() => expect(sentWith("PATCH")).toHaveLength(1))
    // Nobody else is on it: nobody to ask about.
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(sentWith("PATCH")[0]).toMatchObject({ apiEndpoint: "/calendar/events", appendToUrl: "/e1" })
    expect(sentWith("PATCH")[0].payload).toEqual({ sequence: 3, start: { at: iso(now.getDate(), 11), zone: expect.any(String) }, end: { at: iso(now.getDate(), 12) } })
    expect(makeRequest.mock.calls.some(([r]) => String(r.apiEndpoint).startsWith("/event/updateEvent"))).toBe(false)
  })

  it("closing Tell guests puts the block back and sends nothing", async () => {
    events = [meeting()]
    server()
    render(<CalendarApp />)
    dragFirstEventTwoHours()
    await tellGuests()
    await act(async () => void fireEvent.keyDown(document.activeElement!, { key: "Escape" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await act(async () => {})
    expect(makeRequest).not.toHaveBeenCalled()
    // Drawn where it was dropped while asked, as Google's grid does, and put back as the question closed.
    const drawn = refetch.mock.calls.filter(([f]) => typeof f === "function").map(([f]) => f({ data: [meeting()] }).data[0].event_start_time)
    expect(drawn).toEqual([iso(now.getDate(), 11), nineOClock()])
    expect(toast).not.toHaveBeenCalled()
  })

  it("Undo of a move sends with the move's choice and asks nothing", async () => {
    events = [meeting()]
    server()
    render(<CalendarApp />)
    dragFirstEventTwoHours()
    const ask = await tellGuests()
    await act(async () => void fireEvent.click(within(ask).getByRole("button", { name: "Don't send" })))
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Moved “Design review”" })))
    act(() => void fireEvent.keyDown(window, { key: "z" }))
    await waitFor(() => expect(sentWith("PATCH")).toHaveLength(2))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(sentWith("PATCH")[1].payload).toMatchObject({ notify: "none", start: { at: nineOClock() } })
  })

  it("on the old stores a drag still posts /event/updateEvent", async () => {
    repeatsOn = false
    events = [meeting()]
    makeRequest.mockResolvedValue({})
    render(<CalendarApp />)
    dragFirstEventTwoHours()
    await waitFor(() => expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({ apiEndpoint: "/event/updateEvent/e1", payload: expect.objectContaining({ startTime: iso(now.getDate(), 11) }) })))
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  // D-1: asking on every 15-minute nudge would make the keys unusable.
  it("draws a burst of Alt and the arrows at once, and sends it, asking once, a second after the last", async () => {
    events = [meeting()]
    server()
    const { rerender } = render(<CalendarApp />)
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: TEST_TODAY })
    try {
      block().focus()
      for (let i = 0; i < 3; i++) act(() => void fireEvent.keyDown(block(), { key: "ArrowDown", altKey: true }))
      // Drawn where the keys put it, at once.
      const drawn = refetch.mock.calls.filter(([f]) => typeof f === "function")
      expect(drawn).toHaveLength(3)
      events = drawn[2][0]({ data: events }).data
      expect(events![0]).toMatchObject({ event_start_time: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 15).toISOString() })
      // The calendar's copy as drawn: the burst still asks, from where the event was.
      rerender(<CalendarApp />)
      act(() => void vi.advanceTimersByTime(999))
      expect(makeRequest).not.toHaveBeenCalled()
      act(() => void vi.advanceTimersByTime(1))
    } finally {
      vi.useRealTimers()
      vi.setSystemTime(TEST_TODAY)
    }
    const ask = await tellGuests()
    await act(async () => void fireEvent.click(within(ask).getByRole("button", { name: "Send" })))
    await waitFor(() => expect(sentWith("PATCH")).toHaveLength(1))
    expect(sentWith("PATCH")[0].payload).not.toHaveProperty("notify")
    expect(screen.queryAllByRole("dialog")).toHaveLength(0)
  })

  // CR-250 F6: a burst's second is the calendar's own; leaving it, or Z, ends the wait.
  describe("a burst still waiting", () => {
    const quarterPast = () => new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 15).toISOString()
    const drawnAt = () => refetch.mock.calls.filter(([f]) => typeof f === "function").map(([f]) => f({ data: [standup()] }).data[0].event_start_time)
    /** Alt and the down arrow once on the plain Standup, then `then`, inside the second: its timer never fires. */
    const nudgeThen = (then: () => void) => {
      vi.useRealTimers()
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: TEST_TODAY })
      try {
        block().focus()
        act(() => void fireEvent.keyDown(block(), { key: "ArrowDown", altKey: true }))
        expect(drawnAt()).toEqual([quarterPast()])
        then()
      } finally {
        vi.useRealTimers()
        vi.setSystemTime(TEST_TODAY)
      }
    }

    it("is sent as the calendar is left, asking nothing", async () => {
      server()
      const { unmount } = render(<CalendarApp />)
      nudgeThen(() => {
        expect(makeRequest).not.toHaveBeenCalled()
        unmount()
      })
      await waitFor(() => expect(sentWith("PATCH")).toHaveLength(1))
      expect(sentWith("PATCH")[0].payload).toMatchObject({ sequence: 3, start: { at: quarterPast() } })
      expect(confirm).not.toHaveBeenCalled()
    })

    it("is put back by Z where it was, and never sent", async () => {
      server()
      render(<CalendarApp />)
      nudgeThen(() => {
        act(() => void fireEvent.keyDown(window, { key: "z" }))
        expect(drawnAt()).toEqual([quarterPast(), nineOClock()])
        act(() => void vi.advanceTimersByTime(1000))
      })
      await act(() => new Promise((done) => setTimeout(done, 100)))
      expect(makeRequest).not.toHaveBeenCalled()
      expect(drawnAt()).toEqual([quarterPast(), nineOClock()])
    })
  })

  it("Delete on an event without guests deletes at once, and Undo restores it", async () => {
    server()
    render(<CalendarApp />)
    block().focus()
    act(() => void fireEvent.keyDown(block(), { key: "Delete" }))
    await waitFor(() => expect(sentWith("DELETE")).toEqual([expect.objectContaining({ apiEndpoint: "/calendar/events", appendToUrl: "/e1?scope=all" })]))
    expect(confirm).not.toHaveBeenCalled()
    const drop = refetch.mock.calls.find(([f]) => typeof f === "function")![0]
    expect(drop({ data: [standup()] })).toEqual({ data: [] })
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Deleted “Standup”" })))
    const deleted = toast.mock.calls.find(([t]) => t.title === "Deleted “Standup”")![0]
    expect(`${deleted.description ?? ""}`).not.toMatch(/can't be undone/)
    await act(async () => {
      await deleted.action.props.onClick()
    })
    expect(sentWith("POST")).toEqual([expect.objectContaining({ apiEndpoint: "/calendar/events", appendToUrl: "/e1/restore" })])
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Undone" }))
  })

  it("Delete on a meeting with guests asks Tell your guests it's cancelled? and sends notify=none on Don't send", async () => {
    events = [meeting()]
    server()
    render(<CalendarApp />)
    block().focus()
    act(() => void fireEvent.keyDown(block(), { key: "Delete" }))
    const ask = await screen.findByRole("dialog", { name: "Tell your guests it's cancelled?" })
    expect(makeRequest).not.toHaveBeenCalled()
    await act(async () => void fireEvent.click(within(ask).getByRole("button", { name: "Don't send" })))
    await waitFor(() => expect(sentWith("DELETE")).toEqual([expect.objectContaining({ appendToUrl: "/e1?scope=all&notify=none" })]))
    expect(confirm).not.toHaveBeenCalled()
  })
})
