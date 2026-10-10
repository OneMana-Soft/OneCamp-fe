import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

let fetched: { data?: unknown; isLoading: boolean } = { isLoading: false }
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ ...fetched, mutate: vi.fn() }) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(), isSubmitting: false }) }))

import { BookingPagesDialog } from "./bookingPagesDialog"

afterEach(() => {
  cleanup()
  fetched = { isLoading: false }
})

// The booking pages read as the other lists in dialogs: rows on the dialog's
// ground, the rows' shape while loading, an empty list said with an icon.
describe("the booking pages dialog", () => {
  it("lists pages as rows, not bordered cards", () => {
    fetched = { isLoading: false, data: { data: [{ id: "b1", slug: "sam-rivera", title: "Intro call with Sam", duration_minutes: 30, active: true, hours: { days: [1], start: "09:00", end: "17:00", tz: "UTC" } }] } }
    render(<BookingPagesDialog open onOpenChange={() => {}} />)
    const row = screen.getByText("Intro call with Sam").closest("li") as HTMLElement
    expect(row.className).not.toMatch(/\bborder\b/)
  })

  it("loads as its rows and says when there are none", () => {
    fetched = { isLoading: true }
    render(<BookingPagesDialog open onOpenChange={() => {}} />)
    expect(screen.getByRole("status", { name: "Loading booking pages" })).toBeTruthy()
    cleanup()
    fetched = { isLoading: false, data: { data: [] } }
    render(<BookingPagesDialog open onOpenChange={() => {}} />)
    expect(screen.getByRole("heading", { name: "No booking pages yet" })).toBeTruthy()
  })
})
