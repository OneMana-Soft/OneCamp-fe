import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

let fetched: { data?: unknown; isLoading: boolean } = { isLoading: false }
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ ...fetched, mutate: vi.fn() }) }))
const makeRequest = vi.fn()
const toast = vi.fn()
const confirm = vi.fn()
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
let kept: Record<string, unknown> | undefined
vi.mock("@/lib/preferences/usePreference", () => ({ usePreferences: () => kept }))

import { BookingSettings, deletePageWords } from "./bookingSettings"
import { sampleTimes } from "./bookingEditor"
import { pinTestClock } from "@/lib/testing/testClock"

// The editor takes dates gone by off a page: today is the tests' own.
pinTestClock()

afterEach(() => {
  cleanup()
  fetched = { isLoading: false }
  makeRequest.mockReset()
  toast.mockReset()
  confirm.mockReset()
  kept = undefined
})

const page = { id: "b1", slug: "sam-rivera", title: "Intro call with Sam", description: "", duration_minutes: 30, buffer_minutes: 10, min_notice_minutes: 240, max_days_ahead: 30, active: true, hours: { days: [1, 2, 3], start: "09:00", end: "17:00", tz: "UTC" } }

// content.md K06: booking pages are a page of their own, the list in one card,
// the editor beside a live preview.
describe("the booking settings page", () => {
  it("lists pages as rows inside one card, not bordered cards of their own", () => {
    fetched = { isLoading: false, data: { data: [page] } }
    render(<BookingSettings />)
    const row = screen.getByText("Intro call with Sam").closest("li") as HTMLElement
    expect(row.className).not.toMatch(/\bborder\b|shadow-e/)
    expect(row.closest("[data-booking-list]")?.className).toMatch(/rounded-\[16px\]/)
    expect(screen.getByRole("heading", { level: 1, name: "Booking pages" })).toBeTruthy()
  })

  // PTC-52: the arrow, the title and the card each began at another x.
  it("lines its title, its line and its card up on one left edge, the arrow in the gutter", () => {
    fetched = { isLoading: false, data: { data: [{ ...page, upcoming_bookings: 2 }] } }
    render(<BookingSettings />)
    expect(document.querySelector("[data-booking-header]")!.className).toContain("sm:-ml-9")
    expect(screen.getByText(/Share a link and let people book time/).className).toContain("sm:pl-0")
    expect(screen.getByText(/30 min · \/book\/sam-rivera · 2 upcoming/)).toBeTruthy()
  })

  it("loads as its rows and says when there are none", () => {
    fetched = { isLoading: true }
    render(<BookingSettings />)
    expect(screen.getByRole("status", { name: "Loading booking pages" })).toBeTruthy()
    cleanup()
    fetched = { isLoading: false, data: { data: [] } }
    render(<BookingSettings />)
    expect(screen.getByRole("heading", { name: "No booking pages yet" })).toBeTruthy()
  })

  // The editor is a chunk of its own: the list comes first, the editor when a page opens.
  it("edits beside a live preview of the public page", async () => {
    fetched = { isLoading: false, data: { data: [page] } }
    render(<BookingSettings />)
    expect(document.querySelector("[data-booking-preview]")).toBeNull()
    fireEvent.click(screen.getByText("Intro call with Sam"))
    const preview = await screen.findByRole("complementary", { name: "Preview" })
    expect(preview.textContent).toContain("Intro call with Sam")
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Office hours" } })
    expect(preview.textContent).toContain("Office hours")
    expect(preview.textContent).toContain("9:00\u00a0AM")
  })

  // Calendar A3b: a new page starts from the hours the person keeps.
  it("starts a new page from the person's working hours, or nine to five without them", async () => {
    fetched = { isLoading: false, data: { data: [] } }
    kept = { zone: "Europe/Berlin", "calendar.working_hours": { "2": [{ start: "10:00", end: "12:00" }, { start: "13:00", end: "18:00" }], "4": [{ start: "10:00", end: "16:00" }] } }
    render(<BookingSettings />)
    fireEvent.click(screen.getByRole("button", { name: /New booking page/ }))
    // The page's week is the person's own, ranges and all (gcal-7).
    await screen.findByRole("complementary", { name: "Preview" })
    const on = [...document.querySelectorAll("[data-hours-day]")].filter((d) => d.querySelector("[role=switch]")?.getAttribute("aria-checked") === "true")
    expect(on.map((d) => d.getAttribute("data-hours-day"))).toEqual(["2", "4"])
    expect(screen.getAllByLabelText(/Tuesday: from/)).toHaveLength(2)
    expect(screen.getByRole("complementary", { name: "Preview" }).textContent).toContain("10:00\u00a0AM")
    cleanup()
    kept = { zone: null, "calendar.working_hours": null }
    render(<BookingSettings />)
    fireEvent.click(screen.getByRole("button", { name: /New booking page/ }))
    expect((await screen.findByRole("complementary", { name: "Preview" })).textContent).toContain("9:00\u00a0AM")
  })

  it("offers the first times that fit the hours, the length and the gap", () => {
    expect(sampleTimes({ days: [1], start: "09:00", end: "10:30", tz: "UTC" }, 30, 10)).toEqual(["9:00\u00a0AM", "9:40\u00a0AM"])
  })
})

// CAL-BUG-3: deleting a page deleted its bookings, and every guest's link to
// cancel. The bookings stay now, and the confirmation says how many.
describe("deleting a booking page", () => {
  it("says how many upcoming bookings it has, promising nothing a server may refuse", () => {
    fetched = { isLoading: false, data: { data: [{ ...page, upcoming_bookings: 2 }] } }
    render(<BookingSettings />)
    fireEvent.click(screen.getByRole("button", { name: "Delete Intro call with Sam" }))
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ description: "Its link stops working. It has 2 upcoming bookings." }))
    expect(deletePageWords(1)).toBe("Its link stops working. It has 1 upcoming booking.")
    expect(deletePageWords(0)).toBe("Its link stops working. It has no upcoming bookings.")
  })

  it("leaves a refusal to the dialog, which says the server's reason, and keeps the page", async () => {
    fetched = { isLoading: false, data: { data: [{ ...page, upcoming_bookings: 2 }] } }
    render(<BookingSettings />)
    fireEvent.click(screen.getByRole("button", { name: "Delete Intro call with Sam" }))
    const { onConfirm } = confirm.mock.calls[0][0]
    const refusal = { response: { status: 409, data: { msg: "This page has 2 upcoming bookings. Switch it off instead." } } }
    makeRequest.mockRejectedValueOnce(refusal)
    await expect(onConfirm()).rejects.toBe(refusal)
    expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({ quiet: true }))
    expect(toast).not.toHaveBeenCalled()
  })

  it("says what stayed once it's deleted", async () => {
    fetched = { isLoading: false, data: { data: [{ ...page, upcoming_bookings: 2 }] } }
    render(<BookingSettings />)
    fireEvent.click(screen.getByRole("button", { name: "Delete Intro call with Sam" }))
    makeRequest.mockResolvedValueOnce({ upcoming_bookings: 2 })
    await confirm.mock.calls[0][0].onConfirm()
    expect(toast).toHaveBeenCalledWith({ title: "Deleted “Intro call with Sam”", description: "2 upcoming bookings stay on your calendar." })
  })
})


// gcal-7: a page's own week, in the grid working hours use, and dates of its
// own: a day off, or other hours. Dates gone by come off before the save.
describe("a booking page's own week and dates", () => {
  const LOAD = { timeout: 8000 }
  const addDate = async (typed: string) => {
    fireEvent.click(screen.getByRole("button", { name: "Add a date" }))
    const box = await screen.findByLabelText("Type a date", {}, LOAD)
    fireEvent.change(box, { target: { value: typed } })
    fireEvent.keyDown(box, { key: "Enter" })
  }

  it("shows the page's week in the working hours grid, Monday first", async () => {
    fetched = { isLoading: false, data: { data: [page] } }
    render(<BookingSettings />)
    fireEvent.click(screen.getByText("Intro call with Sam"))
    await screen.findByRole("complementary", { name: "Preview" })
    const grid = document.querySelector("[data-hours-week]") as HTMLElement
    expect([...grid.querySelectorAll("[data-hours-day]")].map((d) => d.getAttribute("data-hours-day"))).toEqual(["1", "2", "3", "4", "5", "6", "0"])
    expect(within(grid).getByRole("switch", { name: "Open on Saturdays" }).getAttribute("aria-checked")).toBe("false")
    expect(screen.getByText("No dates of its own: every week runs as above.")).toBeTruthy()
  })

  it("saves the week, a date off and a date with other hours, without a date gone by", { timeout: 20000 }, async () => {
    fetched = { isLoading: false, data: { data: [{ ...page, hours: { ...page.hours, dates: { "2020-11-03": [] } } }] } }
    makeRequest.mockResolvedValue({ ...page })
    render(<BookingSettings />)
    fireEvent.click(screen.getByText("Intro call with Sam"))
    expect(await screen.findByText("We took off 3 Nov: it has gone by.")).toBeTruthy()
    expect(document.querySelector('[data-hours-date="2020-11-03"]')).toBeNull()
    fireEvent.click(screen.getByRole("switch", { name: "Open on Saturdays" }))
    await addDate("2099-12-24")
    await addDate("2099-12-25")
    const off = document.querySelector('[data-hours-date="2099-12-25"]') as HTMLElement
    expect(within(off).getByText("Day off")).toBeTruthy()
    const other = document.querySelector('[data-hours-date="2099-12-24"]') as HTMLElement
    fireEvent.click(within(other).getByRole("switch"))
    expect(within(other).getAllByLabelText(/: from/)).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(makeRequest).toHaveBeenCalled())
    const { hours } = makeRequest.mock.calls[0][0].payload
    expect(hours.dates).toEqual({ "2099-12-24": [{ start: "09:00", end: "17:00" }], "2099-12-25": [] })
    expect(hours.week["6"]).toEqual([{ start: "09:00", end: "17:00" }])
    expect(hours.days).toContain(6)
  })

  it("takes a date off the list with a target big enough for a thumb", { timeout: 20000 }, async () => {
    fetched = { isLoading: false, data: { data: [{ ...page, hours: { ...page.hours, dates: { "2099-01-01": [] } } }] } }
    render(<BookingSettings />)
    fireEvent.click(screen.getByText("Intro call with Sam"))
    const remove = await screen.findByRole("button", { name: /Remove Thu 1 Jan 2099/ })
    expect(remove.className).toMatch(/size-11|h-11/)
    fireEvent.click(remove)
    expect(document.querySelector('[data-hours-date="2099-01-01"]')).toBeNull()
  })

  it("keeps the edits when a save fails, and says the server's words", async () => {
    fetched = { isLoading: false, data: { data: [page] } }
    makeRequest.mockRejectedValueOnce({ response: { status: 400, data: { msg: "2026-11-16 has gone by: take it off the page's dates." } } })
    render(<BookingSettings />)
    fireEvent.click(screen.getByText("Intro call with Sam"))
    fireEvent.change(await screen.findByLabelText("Title"), { target: { value: "Office hours" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect((await screen.findByRole("alert")).textContent).toBe("2026-11-16 has gone by: take it off the page's dates.")
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Office hours")
    expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({ quiet: true }))
  })
})
