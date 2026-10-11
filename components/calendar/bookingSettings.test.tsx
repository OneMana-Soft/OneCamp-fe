import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

let fetched: { data?: unknown; isLoading: boolean } = { isLoading: false }
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ ...fetched, mutate: vi.fn() }) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(), isSubmitting: false }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))

import { BookingSettings, sampleTimes } from "./bookingSettings"

afterEach(() => {
  cleanup()
  fetched = { isLoading: false }
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
    expect(preview.textContent).toContain("9:00 AM")
  })

  it("offers the first times that fit the hours, the length and the gap", () => {
    expect(sampleTimes({ days: [1], start: "09:00", end: "10:30", tz: "UTC" }, 30, 10)).toEqual(["9:00 AM", "9:40 AM"])
  })
})
