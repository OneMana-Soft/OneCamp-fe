import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// Calendar A7: where events repeat, a new event can (D-CAL-7), made through
// the calendar's own API in the reader's zone; focus time and time off can't.

const makeRequest = vi.fn()
let repeatsOn = true
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useFeature: (name: string) => repeatsOn && name === "calendar_repeats",
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }) }))
vi.mock("@/components/common/peoplePicker", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/common/peoplePicker")>()),
  PeoplePicker: () => <input aria-label="Guests" />,
}))

import { CreateCalendarEventDialog } from "./createCalendarEventDialog"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

beforeEach(() => {
  makeRequest.mockReset()
  makeRequest.mockResolvedValue({})
  repeatsOn = true
})
afterEach(cleanup)

// Tuesday 13 October 2026, 10:00 to 11:00.
const review = { title: "Design review", start: new Date(2026, 9, 13, 10), end: new Date(2026, 9, 13, 11), isFocus: false, guests: [] }

function repeatWeekly() {
  const trigger = screen.getByRole("combobox", { name: "Repeat" })
  act(() => {
    fireEvent.keyDown(trigger, { key: "ArrowDown" })
  })
  act(() => {
    fireEvent.keyDown(screen.getByRole("option", { name: "Weekly on Tuesday" }), { key: "Enter" })
  })
}

describe("a new repeating event", () => {
  it("is made through the calendar's own API, with its rule and the reader's zone", async () => {
    render(<CreateCalendarEventDialog open onOpenChange={() => {}} initial={review} />)
    repeatWeekly()
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create event" }))
    })
    await waitFor(() => expect(makeRequest).toHaveBeenCalled())
    const sent = makeRequest.mock.calls[0][0]
    expect(sent).toMatchObject({ method: "POST", apiEndpoint: "/calendar/events" })
    expect(sent.payload).toMatchObject({
      title: "Design review",
      start: { at: review.start.toISOString(), zone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      end: { at: review.end.toISOString() },
      recurrence: { rule: "FREQ=WEEKLY;BYDAY=TU" },
    })
  })

  it("is made through the calendar's own API when it doesn't repeat too, and as it was where events don't repeat", async () => {
    render(<CreateCalendarEventDialog open onOpenChange={() => {}} initial={review} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create event" }))
    })
    await waitFor(() => expect(makeRequest).toHaveBeenCalled())
    expect(makeRequest.mock.calls[0][0].apiEndpoint).toBe("/calendar/events")
    expect(makeRequest.mock.calls[0][0].payload.recurrence).toBeUndefined()
    cleanup()
    makeRequest.mockClear()
    repeatsOn = false
    render(<CreateCalendarEventDialog open onOpenChange={() => {}} initial={review} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create event" }))
    })
    await waitFor(() => expect(makeRequest).toHaveBeenCalled())
    expect(makeRequest.mock.calls[0][0].apiEndpoint).toBe("/event/createEvent")
  })

  // Calendar A2: anyone can be invited by email; their invitation is emailed
  // unless the organiser says not to (D-CAL-5).
  it("asks whether to email a guest invited by email, and sends them as an address", async () => {
    const withAlex = { ...review, guests: [{ uuid: "maya", name: "Maya Chen" }, { uuid: "", name: "alex@example.com", email: "alex@example.com" }] }
    render(<CreateCalendarEventDialog open onOpenChange={() => {}} initial={withAlex} />)
    fireEvent.click(screen.getByRole("switch", { name: /Email me when guests answer/ }))
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create event" }))
    })
    fireEvent.click(await screen.findByRole("button", { name: "Don't send" }, { timeout: 5000 }))
    // The free times are asked for the member first; the event is the create.
    const created = () => makeRequest.mock.calls.find((c) => c[0].apiEndpoint === "/calendar/events")?.[0]
    await waitFor(() => expect(created()).toBeTruthy())
    expect(created().payload).toMatchObject({
      attendees: [{ user_uuid: "maya" }, { email: "alex@example.com" }],
      notify: "none",
      email_on_answers: true,
    })
  })

  it("saves nothing when the question is closed", async () => {
    const withAlex = { ...review, guests: [{ uuid: "", name: "alex@example.com", email: "alex@example.com" }] }
    render(<CreateCalendarEventDialog open onOpenChange={() => {}} initial={withAlex} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create event" }))
    })
    const send = await screen.findByRole("button", { name: "Send" }, { timeout: 5000 })
    fireEvent.keyDown(send, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("button", { name: "Send" })).toBeNull())
    expect(makeRequest).not.toHaveBeenCalled()
  })

  it("isn't offered for focus time or time off, nor where events don't repeat", () => {
    render(<CreateCalendarEventDialog open onOpenChange={() => {}} initial={{ ...review, isFocus: true }} />)
    expect(screen.queryByRole("combobox", { name: "Repeat" })).toBeNull()
    cleanup()
    repeatsOn = false
    render(<CreateCalendarEventDialog open onOpenChange={() => {}} initial={review} />)
    expect(screen.queryByRole("combobox", { name: "Repeat" })).toBeNull()
  })
})
