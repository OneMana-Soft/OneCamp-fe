import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// Calendar A (CR-B6 M3): a new event shows the person's own default
// reminders wherever the new-event dialog opens (the calendar, the app's
// global "Create event", the phone drawer, Home, the palette), read from
// their preferences in one place: no caller passes them.

vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useFeature: (name: string) => name === "calendar_repeats",
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(), isSubmitting: false }) }))
vi.mock("@/lib/calendar/peopleHours", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/calendar/peopleHours")>()), usePeopleHours: () => ({ hours: {}, where: {} }) }))
// The person's preferences, as the server answers /user/preferences: 30 minutes before, by email, on their own calendar.
const prefs = { "calendar.default_reminders": { mine: { timed: { minutes: [30], email: [30] }, all_day: { minutes: [-540], email: [] } } } }
vi.mock("@/hooks/useFetch", () => ({
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }),
  useFetch: (key: string) => (key === "/user/preferences" ? { data: { data: prefs }, mutate: () => {} } : { data: undefined, mutate: () => {} }),
}))
vi.mock("@/components/common/peoplePicker", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/common/peoplePicker")>()),
  PeoplePicker: () => <input aria-label="Guests" />,
}))

import { CreateCalendarEventDialog } from "./createCalendarEventDialog"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()
afterEach(cleanup)

describe("a new event's reminders", () => {
  it("are the person's own defaults when the dialog opens with nothing but a time (the global Create event)", () => {
    render(<CreateCalendarEventDialog open onOpenChange={() => {}} defaultStartDate={new Date(2026, 9, 12, 9, 0)} />)
    expect(screen.getByRole("combobox", { name: "Reminder 1" }).textContent).toBe("30 minutes before · your default")
    expect(screen.getByRole("combobox", { name: "Reminder 1 comes as" }).textContent).toBe("Email")
  })
})
