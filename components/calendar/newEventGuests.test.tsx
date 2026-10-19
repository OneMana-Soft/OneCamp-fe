import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// Esc in a new event's guests closes the names offered, and only them (one
// press, one thing; lib/keys/escapeOwn). The dialog heard it first, in the
// document, and closed: the event being made went with the suggestions.

const RIVERA = { type: "user", user_uuid: "u-rivera", user_name: "Sam Rivera", user_profile_object_key: "" }
const makeRequest = vi.fn(async (o: { apiEndpoint: string; payload: { search_text?: string } }) =>
  o.apiEndpoint.includes("search") && o.payload.search_text === "Sam" ? [RIVERA] : [],
)
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()), useFeature: () => false }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }) }))

import { CreateCalendarEventDialog } from "./createCalendarEventDialog"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()
afterEach(cleanup)

// A name is looked up after a 200 ms pause; a whole suite on a busy machine
// can take seconds to get there, so the wait is generous.
const SLOW = { timeout: 5000 }

describe("a new event's guests", () => {
  it("close their suggestions on Esc, and the event stays to be finished; the next Esc closes it", async () => {
    const onOpenChange = vi.fn()
    render(<CreateCalendarEventDialog open onOpenChange={onOpenChange} defaultStartDate={new Date(2026, 9, 12, 9, 0)} />)
    const guests = screen.getByLabelText("Guests")
    fireEvent.change(guests, { target: { value: "Sam" } })
    await screen.findByRole("option", { name: "Sam Rivera" }, SLOW)
    fireEvent.keyDown(guests, { key: "Escape" })
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(onOpenChange).not.toHaveBeenCalled()
    fireEvent.keyDown(guests, { key: "Escape" })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  }, 20_000)
})
