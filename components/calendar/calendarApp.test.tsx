import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// What the calendar asks the server for, by URL, and what each answers.
const asked: string[] = []
let connected = false
let loading = false
let failing = false
let free = false
const now = new Date()
const iso = (d: number, h: number) => new Date(now.getFullYear(), now.getMonth(), d, h).toISOString()
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    asked.push(url)
    if (loading && (url.includes("/event/getEvents") || url.includes("assignedTaskList"))) return { data: undefined, isLoading: true, mutate: vi.fn() }
    if (failing && url.includes("/event/getEvents")) return { data: undefined, isLoading: false, isError: new Error("502"), mutate: vi.fn() }
    if (url.includes("/event/getEvents"))
      return { data: { data: free ? [] : [{ event_uuid: "e1", event_title: "Standup", event_start_time: iso(now.getDate(), 9), event_end_time: iso(now.getDate(), 10) }] }, isLoading: false, mutate: vi.fn() }
    if (url.includes("assignedTaskList")) return { data: { data: { user_tasks: [] } }, isLoading: false, mutate: vi.fn() }
    return { data: { data: { isConnected: connected } }, isLoading: false, mutate: vi.fn() }
  },
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(), isSubmitting: false }) }))
const confirm = vi.fn()
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/components/calendar/createCalendarEventDialog", () => ({ CreateCalendarEventDialog: () => null }))
vi.mock("@/components/calendar/bookingPagesDialog", () => ({ BookingPagesDialog: () => null }))

import { CalendarApp } from "./calendarApp"

afterEach(() => {
  cleanup()
  asked.length = 0
  confirm.mockReset()
  connected = false
  loading = false
  failing = false
  free = false
})

const ranges = () => new Set(asked.filter((u) => u.includes("/event/getEvents")))

describe("the calendar", () => {
  it("switches between month, week and day without asking for anything new, and without a spinner", () => {
    render(<CalendarApp />)
    const first = ranges()
    expect(first.size).toBe(1)
    fireEvent.click(screen.getByRole("button", { name: "week" }))
    expect(screen.getByText("All day")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "day" }))
    expect(screen.getByRole("button", { name: "Previous day" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "month" }))
    expect(ranges()).toEqual(first)
    expect(screen.queryByText(/Syncing calendar/)).toBeNull()
  })

  it("shows the month grid's days while its items load, not a spinner in their place", () => {
    loading = true
    render(<CalendarApp />)
    expect(screen.getAllByText("15").length).toBeGreaterThan(0)
    expect(screen.queryByText(/Syncing calendar/)).toBeNull()
    expect(screen.getByRole("status").textContent).toBe("Loading…")
  })

  it("asks before disconnecting Google Calendar", () => {
    connected = true
    render(<CalendarApp />)
    // In the sidebar's calendars on a wide screen, in the header below it.
    fireEvent.click(screen.getAllByRole("button", { name: "Disconnect Google Calendar" })[0])
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: "Disconnect Google Calendar?", destructive: true }))
  })

  it("colours a personal event by its calendar", () => {
    render(<CalendarApp />)
    const bar = document.querySelector('[data-event-uuid="e1"]') as HTMLElement
    expect(bar.getAttribute("data-hue")).toBe("sky")
    expect(bar.className).toMatch(/hue-sky/)
  })

  it("keeps the view switch in one place whatever the view, away from the title that changes width", () => {
    render(<CalendarApp />)
    const views = document.querySelector("[data-calendar-views]") as HTMLElement
    const title = screen.getByText(/\d{4}$/, { selector: "[aria-live]" })
    // Not in the title's group, and first in its own: nothing before it changes with the view.
    expect(views.parentElement?.contains(title)).toBe(false)
    expect(views.parentElement?.firstElementChild).toBe(views)
    fireEvent.click(screen.getByRole("button", { name: "week" }))
    expect(document.querySelector("[data-calendar-views]")?.parentElement?.firstElementChild).toBe(document.querySelector("[data-calendar-views]"))
  })

  it("says it is loading along the header's edge, moving nothing in its rows", () => {
    loading = true
    render(<CalendarApp />)
    const status = screen.getByRole("status")
    expect(status.className).toMatch(/\babsolute\b/)
    expect(status.closest("[data-calendar-views]")).toBeNull()
    expect(status.parentElement?.hasAttribute("data-calendar-header")).toBe(true)
  })

  it("says a free month is free, as a free week does", () => {
    free = true
    render(<CalendarApp />)
    expect(screen.getByText("Nothing on this month")).toBeTruthy()
  })

  it("says a failed load failed, rather than showing an empty month", () => {
    failing = true
    render(<CalendarApp />)
    expect(screen.getByRole("heading", { name: "Couldn't load your calendar" })).toBeTruthy()
    expect(screen.queryByText("Nothing on this month")).toBeNull()
  })

  it("shows a month bar's time only where the bar has room for it", () => {
    render(<CalendarApp />)
    const bar = document.querySelector('[data-event-uuid="e1"]') as HTMLElement
    const time = [...bar.querySelectorAll("span")].find((s) => /am|pm/.test(s.textContent || "") && s.textContent !== bar.textContent)
    expect(time?.className).toMatch(/hidden @\[\d+rem\]\/month:inline/)
    expect(bar.textContent).toContain("Standup")
  })

  it("lists Google Calendar and the booking pages with the calendars on a wide screen", () => {
    render(<CalendarApp />)
    const aside = document.querySelector("aside") as HTMLElement
    expect(aside.textContent).toContain("Connect Google Calendar")
    expect(aside.textContent).toContain("Booking pages")
  })
})
