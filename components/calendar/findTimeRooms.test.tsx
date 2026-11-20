import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"

// Find a time with rooms (gcal-6): the chosen rooms go as FindTimeInput.rooms,
// so a time a room is booked is never offered; a room alone is enough to look.
const post = vi.hoisted(() => ({ makeRequest: vi.fn(async () => ({ suggestions: [] })) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: post.makeRequest, isSubmitting: false }) }))

import { FindTimeSuggestions } from "@/components/calendar/findTimeSuggestions"

beforeEach(() => {
  vi.useFakeTimers()
  post.makeRequest.mockClear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const payloadOf = (n = 0) => (post.makeRequest.mock.calls[n] as unknown as [{ payload: Record<string, unknown> }])[0].payload

describe("FindTimeSuggestions with rooms", () => {
  it("passes the chosen rooms, and looks for a room alone", async () => {
    render(<FindTimeSuggestions participants={[]} rooms={["r-atlas"]} durationMinutes={60} onPick={() => {}} />)
    await act(async () => vi.advanceTimersByTime(450))
    expect(post.makeRequest).toHaveBeenCalledTimes(1)
    expect(payloadOf()).toMatchObject({ participants: [], rooms: ["r-atlas"], duration_minutes: 60 })
  })

  it("looks again when the rooms change, and sends none when none is chosen", async () => {
    const { rerender } = render(<FindTimeSuggestions participants={["u1"]} durationMinutes={30} onPick={() => {}} />)
    await act(async () => vi.advanceTimersByTime(450))
    expect(payloadOf(0)).not.toHaveProperty("rooms")
    rerender(<FindTimeSuggestions participants={["u1"]} rooms={["r-booth"]} durationMinutes={30} onPick={() => {}} />)
    await act(async () => vi.advanceTimersByTime(450))
    expect(post.makeRequest).toHaveBeenCalledTimes(2)
    expect(payloadOf(1)).toMatchObject({ rooms: ["r-booth"] })
  })
})
