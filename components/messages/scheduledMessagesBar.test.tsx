import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import type { ScheduledMessage } from "@/hooks/useScheduledMessages"

// The conversation's queue, as the list hook hands it to the bar.
let queued: ScheduledMessage[] = []
vi.mock("@/hooks/useScheduledMessages", () => ({
  useScheduledMessages: () => ({ items: queued, cancel: vi.fn(), sendNow: vi.fn(), reschedule: vi.fn() }),
}))

const { ScheduledMessagesBar } = await import("./scheduledMessagesBar")

const message = (id: string): ScheduledMessage => ({ id, kind: "dm", target: "dm-1", send_at: "2026-11-09T03:30:00Z", status: "pending", preview: `Note ${id}` })

// The message goes tomorrow morning on the clock the test sets.
vi.setSystemTime(new Date("2026-11-08T10:00:00Z"))

afterEach(() => {
  cleanup()
  queued = []
})

describe("the scheduled messages bar", () => {
  it("opens its list only on its own tap: after the last message leaves, the next one scheduled leaves it closed (V-774)", () => {
    queued = [message("a")]
    const { rerender } = render(<ScheduledMessagesBar target="dm-1" />)
    act(() => screen.getByRole("button", { name: /1 message scheduled/ }).click())
    expect(screen.getByRole("dialog", { name: "Scheduled messages" })).toBeTruthy()

    // Its last message is deleted from the list: the bar and its list leave.
    queued = []
    rerender(<ScheduledMessagesBar target="dm-1" />)
    expect(screen.queryByRole("dialog")).toBeNull()

    // Another is scheduled from the box: the bar comes back, its list stays shut.
    queued = [message("b")]
    rerender(<ScheduledMessagesBar target="dm-1" />)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("button", { name: /1 message scheduled/ })).toBeTruthy()

    // Its own tap still opens it.
    act(() => screen.getByRole("button", { name: /1 message scheduled/ }).click())
    expect(screen.getByRole("dialog", { name: "Scheduled messages" })).toBeTruthy()
  })
})
