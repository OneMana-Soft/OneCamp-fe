import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// The doc lists, the docs search and the trash end in one footer
// (usePagedList's PagedListFooter); each drew its own copy before, and the
// search's said a failure without registering it, so a toast could say it too.

const toast = vi.fn((_copy: unknown) => ({ dismiss: vi.fn() }))
vi.mock("@/hooks/use-toast", () => ({ toast: (copy: unknown) => toast(copy) }))

const { PagedListFooter } = await import("./usePagedList")
const { READ_FAILURE_BEAT_MS, tellReadFailure } = await import("@/lib/http/loadFailure")

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  toast.mockClear()
})

describe("the foot of a list read a page at a time", () => {
  it("says the next page failed, with Try again, and nothing else", () => {
    const onRetry = vi.fn()
    render(<PagedListFooter what="results" failed loading onRetry={onRetry} />)
    expect(screen.getByRole("alert").textContent).toBe("Couldn't load more results.Try again")
    expect(screen.queryByRole("status")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it("says Loading… while a page is on its way, and nothing at the end", () => {
    const { rerender } = render(<PagedListFooter what="docs" failed={false} loading onRetry={() => {}} />)
    expect(screen.getByRole("status").textContent).toBe("Loading…")
    rerender(<PagedListFooter what="docs" failed={false} loading={false} onRetry={() => {}} />)
    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("keeps a failed read's toast quiet while it says the failure itself", () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] })
    const failed = { response: { status: 500, data: {} } }
    const { unmount } = render(<PagedListFooter what="of the trash" failed loading={false} onRetry={() => {}} />)
    tellReadFailure(failed)
    vi.advanceTimersByTime(READ_FAILURE_BEAT_MS)
    expect(toast).not.toHaveBeenCalled()
    // With nothing on screen saying it, the same failure is toasted.
    unmount()
    tellReadFailure(failed)
    vi.advanceTimersByTime(READ_FAILURE_BEAT_MS)
    expect(toast).toHaveBeenCalledTimes(1)
  })
})
