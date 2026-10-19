import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const makeRequest = vi.fn()
// The server's optional features (useClientConfig), asked of nothing here:
// repeats are off, as on a server whose calendar isn't in its one store.
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()), useFeature: () => false }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))
beforeEach(() => {
  makeRequest.mockReset()
  makeRequest.mockResolvedValue({ slots: [
    { start: "2026-10-12T04:30:00Z", end: "2026-10-12T05:00:00Z" },
    { start: "2026-10-12T05:30:00Z", end: "2026-10-12T06:00:00Z" },
  ], busy: {} })
})
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }) }))
vi.mock("@/components/common/peoplePicker", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/common/peoplePicker")>()),
  PeoplePicker: () => <input aria-label="Guests" />,
}))

import { CreateCalendarEventDialog } from "./createCalendarEventDialog"
import { FindTimeSuggestions } from "./findTimeSuggestions"
import { pinTestClock } from "@/lib/testing/testClock"

// Today is TEST_TODAY wherever the code under test reads the time.
pinTestClock()

afterEach(cleanup)

describe("a new event", () => {
  it("picks its times with the same control as the event panel, in the app's words", () => {
    render(<CreateCalendarEventDialog open onOpenChange={() => {}} defaultStartDate={new Date(2026, 9, 12, 9, 0)} />)
    const start = screen.getByLabelText("Start")
    expect(start.tagName).toBe("BUTTON")
    // "Mon 12 Oct · 9:00 AM": the weekday, the day, and the time in the app's words.
    expect(start.textContent).toMatch(/^[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2} · \d{1,2}:\d{2}\s[AP]M$/)
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

  // EV-58: Duplicate opens the dialog with a copy's notes and kind.
  it("opens with the notes and the kind it is given", () => {
    render(<CreateCalendarEventDialog open onOpenChange={() => {}} initial={{ title: "Offsite", start: new Date(2026, 9, 12), end: new Date(2026, 9, 13), isFocus: false, isAway: true, guests: [], description: "Bring numbers" }} />)
    expect((screen.getByPlaceholderText("Agenda, a call link, anything people should know") as HTMLTextAreaElement).value).toBe("Bring numbers")
    expect(screen.getByRole("switch", { name: /^Away/ }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("switch", { name: /^Focus time/ }).getAttribute("aria-checked")).toBe("false")
  })

  // VD-32: ⌘⏎ saves the event you're editing, from any field, the notes included.
  describe("⌘⏎", () => {
    const launch = { title: "Launch review", start: new Date(2026, 9, 12, 9), end: new Date(2026, 9, 12, 10), isFocus: false, guests: [] }
    const notes = () => screen.getByPlaceholderText("Agenda, a call link, anything people should know")
    const created = () => makeRequest.mock.calls.filter(([o]) => o.apiEndpoint === "/event/createEvent")

    it("creates it from the notes, with ⌘ or Ctrl", async () => {
      render(<CreateCalendarEventDialog open onOpenChange={() => {}} initial={launch} />)
      fireEvent.keyDown(notes(), { key: "Enter", ctrlKey: true })
      await waitFor(() => expect(created()).toHaveLength(1))
      expect(created()[0][0].payload).toMatchObject({ title: "Launch review" })
      // Sent: Create event is pressable again (it isn't while it sends).
      await waitFor(() => expect(screen.getByRole("button", { name: "Create event" })).toBeTruthy())
      fireEvent.keyDown(notes(), { key: "Enter", metaKey: true })
      await waitFor(() => expect(created()).toHaveLength(2))
    })

    it("leaves Enter, Shift and Alt alone, and never sends twice while sending", async () => {
      makeRequest.mockReturnValue(new Promise(() => {}))
      render(<CreateCalendarEventDialog open onOpenChange={() => {}} initial={launch} />)
      fireEvent.keyDown(notes(), { key: "Enter" })
      fireEvent.keyDown(notes(), { key: "Enter", ctrlKey: true, altKey: true })
      fireEvent.keyDown(notes(), { key: "Enter", ctrlKey: true, shiftKey: true })
      expect(created()).toHaveLength(0)
      fireEvent.keyDown(notes(), { key: "Enter", ctrlKey: true })
      await waitFor(() => expect(screen.getByRole("button", { name: "Creating…" })).toBeTruthy())
      fireEvent.keyDown(notes(), { key: "Enter", ctrlKey: true })
      await new Promise((r) => setTimeout(r, 20))
      expect(created()).toHaveLength(1)
    })
  })
})
