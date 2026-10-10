import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn().mockResolvedValue({ slots: [
  { start: "2026-10-12T04:30:00Z", end: "2026-10-12T05:00:00Z" },
  { start: "2026-10-12T05:30:00Z", end: "2026-10-12T06:00:00Z" },
], busy: {} }), isSubmitting: false }) }))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }) }))
vi.mock("@/components/common/peoplePicker", () => ({ PeoplePicker: () => <input aria-label="Guests" /> }))

import { CreateCalendarEventDialog } from "./createCalendarEventDialog"
import { FindTimeSuggestions } from "./findTimeSuggestions"

afterEach(cleanup)

describe("a new event", () => {
  it("picks its times with the same control as the event panel, in the app's words", () => {
    render(<CreateCalendarEventDialog open onOpenChange={() => {}} defaultStartDate={new Date(2026, 9, 12, 9, 0)} />)
    const start = screen.getByLabelText("Start")
    expect(start.tagName).toBe("BUTTON")
    expect(start.textContent).toMatch(/^\d{1,2} [A-Z][a-z]{2}( \d{4})?, \d{1,2}:\d{2}\s[AP]M$/)
    expect(document.body.textContent).not.toMatch(/[A-Z][a-z]{2} \d{1,2}, \d{4} ·/)
  })

  it("offers free times as small rounded chips in a column beside their day, not a dashed box", async () => {
    render(<FindTimeSuggestions participants={["u1"]} durationMinutes={30} onPick={() => {}} />)
    expect(document.querySelector("[data-find-time]")?.className).not.toMatch(/dashed/)
    fireEvent.click(screen.getByRole("button", { name: "Find a time" }))
    const chip = await screen.findAllByRole("button", { name: /AM|PM/ })
    expect(chip[0].className).toMatch(/rounded-md/)
    expect(chip[0].className).not.toMatch(/rounded-full/)
    expect(screen.getByText(/^[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}$/)).toBeTruthy()
  })
})
