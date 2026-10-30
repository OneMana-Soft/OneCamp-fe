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

describe("a read the device answered", () => {
  it("tells nothing for what was made offline and isn't on the server yet, and a real 404 still says so", () => {
    // lib/offline answers a read of something made with no network (offlineAnswered): the screen shows its own state.
    tellReadFailure({ config: { url: "/task/info/offline-1", method: "get", offlineAnswered: true }, response: { status: 404, data: { msg: "What you made offline is still waiting to be sent." } } })
    vi.advanceTimersByTime(READ_FAILURE_BEAT_MS + 1)
    expect(toasts).toHaveLength(0)
    tellReadFailure(failed("/task/info/7a5c0000-0000-4000-8000-000000000001", 404, "Task not found"))
    vi.advanceTimersByTime(READ_FAILURE_BEAT_MS + 1)
    expect(toasts.map((t) => t.title)).toEqual(["Not found"])
  })
})
