import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, renderHook } from "@testing-library/react"

// Who says that a read failed: an error state on screen says its own read,
// and its toast stays quiet. It once kept every failed read quiet while it was
// shown: an error state on one card, and a 500 from another said nothing.

const toasts: { title?: string; description?: string }[] = []
vi.mock("@/hooks/use-toast", () => ({
  toast: (t: { title?: string; description?: string }) => {
    toasts.push(t)
    return { id: String(toasts.length), dismiss: () => {}, update: () => {} }
  },
}))

const { tellReadFailure, useSaysLoadFailure, READ_FAILURE_BEAT_MS } = await import("@/lib/http/loadFailure")

const failed = (url: string, status: number, msg: string) => ({ config: { url, method: "get" }, response: { status, data: { msg } } })

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-10-15T12:00:00Z") })
  toasts.length = 0
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("a failed read with an error state on screen", () => {
  it("is quiet when the error state is its own, and when it fails again", () => {
    tellReadFailure(failed("/admin/members", 500, "Members are resting."))
    const { unmount } = renderHook(() => useSaysLoadFailure())
    vi.advanceTimersByTime(READ_FAILURE_BEAT_MS + 1)
    expect(toasts).toHaveLength(0)

    // Try again, and it fails again: still said in place.
    vi.advanceTimersByTime(10_000)
    tellReadFailure(failed("/admin/members", 500, "Members are resting."))
    vi.advanceTimersByTime(READ_FAILURE_BEAT_MS + 1)
    expect(toasts).toHaveLength(0)
    unmount()
  })

  it("still says a read that failed for something else", () => {
    tellReadFailure(failed("/admin/members", 500, "Members are resting."))
    const { unmount } = renderHook(() => useSaysLoadFailure())
    vi.advanceTimersByTime(10_000)

    tellReadFailure(failed("/admin/webhooks", 503, "Webhooks couldn't be read."))
    vi.advanceTimersByTime(READ_FAILURE_BEAT_MS + 1)
    expect(toasts.map((t) => t.description)).toEqual(["Webhooks couldn't be read."])
    unmount()
  })
})
