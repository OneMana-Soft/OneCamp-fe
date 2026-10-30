import { afterEach, describe, expect, it, vi } from "vitest"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

const makeRequest = vi.hoisted(() => vi.fn())
const toasts = vi.hoisted(() => [] as { title?: unknown; description?: unknown; action?: unknown; variant?: unknown }[])
const dismissed = vi.hoisted(() => [] as string[])
const updates = vi.hoisted(() => [] as { action?: unknown; description?: unknown }[])
const axiosGet = vi.hoisted(() => vi.fn())
const axiosPost = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))
vi.mock("@/hooks/use-toast", () => ({
  toast: (t: { title?: unknown }) => {
    toasts.push(t)
    const id = String(toasts.length)
    return { id, dismiss: () => dismissed.push(id), update: (u: { action?: unknown; description?: unknown }) => updates.push(u) }
  },
  useToast: () => ({ toast: vi.fn() }),
}))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: axiosGet, post: axiosPost } }))
// A toast's action outside a toaster: a plain button, or its own link.
vi.mock("@/components/ui/toast", () => ({
  ToastAction: ({ children, onClick, asChild }: { children: React.ReactNode; onClick?: () => void; asChild?: boolean }) =>
    asChild ? children : (
      <button type="button" onClick={onClick}>
        {children}
      </button>
    ),
}))

import { ReminderRow, withReminders } from "./reminderRow"
import { isReminder, showReminder, snoozeChoices } from "@/components/calendar/reminderToast"
import type { CalendarEventInterface } from "@/types/calendar"
import { pinTestClock } from "@/lib/testing/testClock"
import { clockTime } from "@/lib/utils/date/clock"

// The reader's day: Thu 15 Oct 2026, 10:00.
pinTestClock(new Date(2026, 9, 15, 10))

/** Opens a Radix menu in jsdom, as the menu tests do. */
function openMenu(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" })
  fireEvent.keyDown(trigger, { key: "Enter" })
}

afterEach(() => {
  cleanup()
  makeRequest.mockReset()
  axiosGet.mockReset()
  axiosPost.mockReset()
  toasts.length = 0
  updates.length = 0
  dismissed.length = 0
})

const event = (extra: Partial<CalendarEventInterface> = {}): CalendarEventInterface => ({
  event_uuid: "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c4d",
  event_title: "Design review",
  event_start_time: new Date(2026, 9, 15, 11).toISOString(),
  event_end_time: new Date(2026, 9, 15, 12).toISOString(),
  event_reminders: [10],
  event_reminders_default: true,
  ...extra,
})

// STEP4_PLAN §4 #5, calendar A5: a bell, then "10 minutes before", or "Add a
// reminder"; a click opens the choices (a menu beside the row, or a phone's
// sheet), the one in force checked at the end; a choice is saved at once, with
// no toast.
describe("the Reminders row", () => {
  it("says the reminder, and saves a choice at once without a toast", async () => {
    makeRequest.mockResolvedValue({ minutes: [30], default: false })
    render(<ReminderRow event={event()} />)
    const row = screen.getByRole("button", { name: "Reminders: 10 minutes before" })
    openMenu(row)
    // The one in force ends in the shared check; the rest keep its slot empty.
    const chosen = await screen.findByRole("menuitemradio", { name: "10 minutes before" })
    expect(chosen.getAttribute("aria-checked")).toBe("true")
    expect(chosen.lastElementChild?.getAttribute("data-menu-check")).toBe("on")
    expect(screen.getByRole("menuitemradio", { name: "No reminder" }).lastElementChild?.getAttribute("data-menu-check")).toBe("off")
    fireEvent.click(screen.getByRole("menuitemradio", { name: "30 minutes before" }))
    await waitFor(() => expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({ method: "PUT", appendToUrl: "/0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c4d/reminders", payload: { minutes: [30] } })))
    expect(screen.getByRole("button", { name: "Reminders: 30 minutes before" })).toBeTruthy()
    expect(toasts).toHaveLength(0)
  })

  it("chooses no reminder, and goes back when it couldn't be saved, saying so", async () => {
    makeRequest.mockRejectedValue(new Error("offline"))
    render(<ReminderRow event={event()} />)
    openMenu(screen.getByRole("button", { name: /Reminders/ }))
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "No reminder" }))
    await waitFor(() => expect(toasts).toHaveLength(1))
    expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({ payload: { minutes: [] } }))
    expect(toasts[0].title).toBe("Couldn't save your reminder. Try again.")
    expect(screen.getByRole("button", { name: "Reminders: 10 minutes before" })).toBeTruthy()
  })

  it("asks to add one, in muted ink, when there is none", async () => {
    render(<ReminderRow event={event({ event_reminders: [], event_reminders_default: false })} />)
    const row = screen.getByRole("button", { name: "Add a reminder" })
    expect(within(row).getByText("Add a reminder").className).toMatch(/\btext-ink-3\b/)
    openMenu(row)
    expect((await screen.findByRole("menuitemradio", { name: "No reminder" })).getAttribute("aria-checked")).toBe("true")
  })

  it("on a phone, is a sheet of its own: Remind me, the event under it, and a choice closes it", async () => {
    makeRequest.mockResolvedValue({ minutes: [30], default: false })
    render(<ReminderRow event={event()} phone />)
    fireEvent.click(screen.getByRole("button", { name: "Reminders: 10 minutes before" }))
    const sheet = await screen.findByRole("dialog", { name: "Remind me" })
    expect(sheet.getAttribute("data-detent")).toBe("menu")
    expect(within(sheet).getByText("Design review")).toBeTruthy()
    const rows = within(within(sheet).getByRole("group", { name: "Remind me" })).getAllByRole("button")
    expect(rows.map((b) => b.textContent)).toEqual(["No reminder", "At the start", "5 minutes before", "10 minutes before", "30 minutes before", "1 hour before", "1 day before"])
    // Under them, the sheet's thumb's-reach way out.
    expect(within(sheet).getByRole("button", { name: "Cancel" })).toBeTruthy()
    expect(within(sheet).getByRole("button", { name: "10 minutes before" }).getAttribute("aria-current")).toBe("true")
    fireEvent.click(within(sheet).getByRole("button", { name: "30 minutes before" }))
    await waitFor(() => expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({ payload: { minutes: [30] } })))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Remind me" })).toBeNull())
    expect(screen.getByRole("button", { name: "Reminders: 30 minutes before" })).toBeTruthy()
  })

  it("offers an all-day event's choices as times of day, on the reader's clock", async () => {
    render(<ReminderRow event={event({ event_all_day: true, event_start_date: "2026-10-20", event_end_date: "2026-10-21", event_reminders: [900] })} />)
    const row = screen.getByRole("button", { name: `Reminders: The day before at ${clockTime("09:00")}` })
    openMenu(row)
    expect(await screen.findByRole("menuitemradio", { name: `On the day at ${clockTime("09:00")}` })).toBeTruthy()
  })

  it("shows the change on every occurrence of the event in the calendar's copy", () => {
    const series = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c4d"
    const cur = { data: [event({ event_uuid: `${series}_20261015T100000Z` }), event({ event_uuid: `${series}_20261022T090000Z` }), event({ event_uuid: "other", event_reminders: [10] })] }
    const next = withReminders(cur, `${series}_20261015T100000Z`, [0], false)!
    expect(next.data.map((e) => e.event_reminders)).toEqual([[0], [0], [10]])
  })
})

describe("a reminder in the open app", () => {
  const notice = (extra: Record<string, unknown> = {}) => ({
    notice_id: "n-1",
    sent_at: new Date(2026, 9, 15, 9, 59).toISOString(),
    data: {
      type: "calendar", type_id: "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c4d", tag: "reminder:0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c4d",
      title: "Design review in 10 minutes", body: "Thu 15 Oct, 10:10–11:00",
      start: new Date(2026, 9, 15, 10, 10).toISOString(), end: new Date(2026, 9, 15, 11).toISOString(),
    },
    ...extra,
  })

  const ten = new Date(2026, 9, 15, 10).getTime()

  it("is a toast with when it is, Open, and a quiet Snooze that opens every snooze; then Join once the event shows a call; and only once", async () => {
    axiosGet.mockResolvedValue({ data: { data: event({ event_description: "<p>Join https://meet.example.com/abc</p>" }) } })
    await showReminder(notice(), ten)
    await showReminder(notice(), ten)
    expect(toasts).toHaveLength(1)
    expect(toasts[0].title).toBe("Design review in 10 minutes")
    // One action: Open, the event's own page.
    const open = render(<>{toasts[0].action as React.ReactElement}</>)
    expect(open.getByRole("link", { name: "Open" }).getAttribute("href")).toBe("/app/calendar/event/0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c4d")
    open.unmount()
    render(<>{toasts[0].description as React.ReactElement}</>)
    expect(screen.getByText("Thu 15 Oct, 10:10–11:00")).toBeTruthy()
    // The snoozes wait behind one quiet word.
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Snooze"])
    fireEvent.click(screen.getByRole("button", { name: "Snooze" }))
    const group = screen.getByRole("group", { name: "Snooze until" })
    expect(within(group).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Snooze for 5 minutes", "Snooze until a minute before", "Snooze until it starts"])
    await waitFor(() => expect(updates).toHaveLength(1))
    // Join in Open's place.
    render(<>{updates[0].action as React.ReactElement}</>)
    expect(screen.getByRole("link", { name: "Join" }).getAttribute("href")).toBe("https://meet.example.com/abc")
  })

  it("says where it is beside when, and keeps Open when there is no call", async () => {
    axiosGet.mockResolvedValue({ data: { data: event({ event_location: "Room 4" }) } })
    await showReminder(notice({ notice_id: "n-6" }), ten)
    await waitFor(() => expect(updates).toHaveLength(1))
    render(<>{updates[0].description as React.ReactElement}</>)
    expect(screen.getByText("Thu 15 Oct, 10:10–11:00 · Room 4")).toBeTruthy()
    render(<>{updates[0].action as React.ReactElement}</>)
    expect(screen.getByRole("link", { name: "Open" })).toBeTruthy()
    expect(screen.queryByRole("link", { name: "Join" })).toBeNull()
  })

  it("snoozes until it starts, closes, and says until when", async () => {
    axiosGet.mockRejectedValue(new Error("offline"))
    axiosPost.mockResolvedValue({ data: { data: { at: new Date(2026, 9, 15, 10, 10).toISOString() } } })
    await showReminder(notice({ notice_id: "n-4" }), ten)
    render(<>{toasts[0].description as React.ReactElement}</>)
    fireEvent.click(screen.getByRole("button", { name: "Snooze" }))
    fireEvent.click(screen.getByRole("button", { name: "Snooze until it starts" }))
    await waitFor(() => expect(toasts).toHaveLength(2))
    expect(axiosPost).toHaveBeenCalledWith("/calendar/events/0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c4d/snooze", { until: "start" }, OWN_ERRORS)
    expect(dismissed).toEqual(["1"])
    expect(toasts[1].title).toMatch(/^Snoozed until 10:10/)
    expect(updates).toHaveLength(0)
  })

  it("says why a snooze was refused, and stays", async () => {
    axiosGet.mockRejectedValue(new Error("offline"))
    axiosPost.mockRejectedValue({ isAxiosError: true, response: { status: 400, data: { msg: "That's already passed. Snooze for 5 minutes instead." } } })
    await showReminder(notice({ notice_id: "n-5" }), ten)
    render(<>{toasts[0].description as React.ReactElement}</>)
    fireEvent.click(screen.getByRole("button", { name: "Snooze" }))
    fireEvent.click(screen.getByRole("button", { name: "Snooze until a minute before" }))
    await waitFor(() => expect(toasts).toHaveLength(2))
    expect(toasts[1]).toMatchObject({ title: "That's already passed. Snooze for 5 minutes instead.", variant: "destructive" })
    expect(dismissed).toEqual([])
  })

  it("offers only the snoozes still ahead and before the end", () => {
    const at = (h: number, m: number) => new Date(2026, 9, 15, h, m).toISOString()
    const names = (data: Record<string, string>, h: number, m: number) => snoozeChoices(data, new Date(2026, 9, 15, h, m).getTime()).map((c) => c.until)
    // Ten minutes before a 10:10 start: all three, soonest first.
    expect(names({ start: at(10, 10), end: at(11, 0) }, 10, 0)).toEqual(["5m", "1m", "start"])
    // Two minutes before: a minute before is too close to be worth it.
    expect(names({ start: at(10, 10), end: at(11, 0) }, 10, 8)).toEqual(["start", "5m"])
    // At the start: five minutes, while it hasn't ended.
    expect(names({ start: at(10, 10), end: at(11, 0) }, 10, 10)).toEqual(["5m"])
    // Four minutes from its end: nothing.
    expect(names({ start: at(10, 10), end: at(10, 30) }, 10, 26)).toEqual([])
    // An all-day event's: five minutes.
    expect(names({ date: "2026-10-16", all_day: "true" }, 9, 0)).toEqual(["5m"])
  })

  it("passes over a replay, and anything that isn't a reminder", async () => {
    await showReminder(notice({ notice_id: "n-2", sent_at: new Date(2026, 9, 15, 9, 40).toISOString() }), new Date(2026, 9, 15, 10).getTime())
    await showReminder(notice({ notice_id: "n-3", data: { type: "calendar", type_id: "x", tag: "calendar:x", title: "Invited" } }), new Date(2026, 9, 15, 10).getTime())
    expect(toasts).toHaveLength(0)
    expect(isReminder({ type: "calendar", tag: "reminder:x" })).toBe(true)
    expect(isReminder({ type: "chat", tag: "reminder:x" })).toBe(false)
  })
})
