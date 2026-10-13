import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// CAL-BUG-12: AI "Find a time" and "Find a better time" shifted business hours
// by a fixed offset (wrong across a clock change), and treated a calendar
// they couldn't read as free. They send the zone now, and say what the times
// leave out under them.

const { post, toast } = vi.hoisted(() => ({ post: vi.fn(), toast: vi.fn() }))
vi.mock("@/lib/axiosInstance", () => ({ default: { post }, OWN_ERRORS: {} }))
vi.mock("@/lib/utils/timeZone", () => ({ browserTZ: () => "America/New_York" }))
// One toast function, as the real hook gives: the dialog asks again whenever it changes.
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
vi.mock("@/components/common/withFeature", () => ({ withAI: <P extends object>(C: React.ComponentType<P>) => C }))

import AiScheduleDialog from "./AiScheduleDialog"
import RescheduleDialog from "./RescheduleDialog"

const NOTE = "Couldn't read Maya's calendar, so no time counts as free for Maya."
const slot = { start: "2026-10-14T14:00:00Z", end: "2026-10-14T14:30:00Z", all_free: false, free_count: 1, total: 2 }

afterEach(() => {
  cleanup()
  post.mockReset()
})

describe("finding a time", () => {
  it("sends the zone, and says what the times leave out under them", async () => {
    post.mockResolvedValue({ data: { data: { enabled: true, duration_mins: 30, candidates: [slot], participants: [{ uuid: "m", name: "Maya" }], unresolved: [], note: NOTE } } })
    render(<AiScheduleDialog open onOpenChange={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/Participants|With/i), { target: { value: "Maya" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Find times" })))
    expect(post.mock.calls[0][1]).toMatchObject({ timezone: "America/New_York" })
    expect(document.querySelector("[data-schedule-note]")?.textContent).toBe(NOTE)
  })

  it("says nothing more when there is nothing to say", async () => {
    post.mockResolvedValue({ data: { data: { enabled: true, duration_mins: 30, candidates: [slot], participants: [], unresolved: [] } } })
    render(<AiScheduleDialog open onOpenChange={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/Participants|With/i), { target: { value: "Maya" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Find times" })))
    expect(document.querySelector("[data-schedule-note]")).toBeNull()
  })
})

describe("finding a better time", () => {
  it("sends the zone, and says what the times leave out under them", async () => {
    post.mockResolvedValue({
      data: { data: { enabled: true, event_uuid: "e1", title: "Standup", current_start: slot.start, current_end: slot.end, duration_mins: 30, participants: [], conflict_count: 0, conflicts: [], candidates: [slot], note: NOTE } },
    })
    await act(async () => {
      render(<RescheduleDialog open onOpenChange={vi.fn()} eventUUID="e1" />)
    })
    expect(post.mock.calls[0][1]).toMatchObject({ event_uuid: "e1", timezone: "America/New_York" })
    expect(document.querySelector("[data-schedule-note]")?.textContent).toBe(NOTE)
  })
})
