import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

let fetched: { data?: unknown; isLoading: boolean } = { isLoading: false }
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ ...fetched, mutate: vi.fn() }) }))
const makeRequest = vi.fn()
const toast = vi.fn()
const confirm = vi.fn()
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))

import { BookingSettings, deletePageWords, sampleTimes } from "./bookingSettings"

afterEach(() => {
  cleanup()
  fetched = { isLoading: false }
  makeRequest.mockReset()
  toast.mockReset()
  confirm.mockReset()
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

  it("edits beside a live preview of the public page", () => {
    fetched = { isLoading: false, data: { data: [page] } }
    render(<BookingSettings />)
    fireEvent.click(screen.getByText("Intro call with Sam"))
    const preview = document.querySelector("[data-booking-preview]") as HTMLElement
    expect(preview.textContent).toContain("Intro call with Sam")
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Office hours" } })
    expect(preview.textContent).toContain("Office hours")
    expect(preview.textContent).toContain("9:00\u00a0AM")
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

