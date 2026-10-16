import { describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import { useOlderPages } from "./useOlderPages"

// SD-BUG-5: a conversation shorter than a page asked for an older page its
// latest page said wasn't there. SD-BUG-1: a failed older page left the list
// saying the conversation began there, with nothing to try again.
describe("a conversation's older pages", () => {
  const older = (isError?: unknown) => ({ isError, mutate: vi.fn() })

  it("start from what the latest page said", () => {
    const setHasMore = vi.fn()
    const { rerender } = renderHook((p: { more?: boolean }) => useOlderPages({ latestHasMore: p.more, setHasMore, asking: false, older: older() }), { initialProps: {} })
    expect(setHasMore).not.toHaveBeenCalled()
    rerender({ more: false })
    expect(setHasMore).toHaveBeenLastCalledWith(false)
    rerender({ more: true })
    expect(setHasMore).toHaveBeenLastCalledWith(true)
  })

  it("offer Try again only for a page asked for that failed", () => {
    const failed = older(new Error("503"))
    const { result, rerender } = renderHook((p: { asking: boolean; o: ReturnType<typeof older> }) => useOlderPages({ latestHasMore: true, setHasMore: () => {}, asking: p.asking, older: p.o }), {
      initialProps: { asking: true, o: older() },
    })
    expect(result.current).toBeUndefined()
    rerender({ asking: true, o: failed })
    result.current!()
    expect(failed.mutate).toHaveBeenCalledTimes(1)
    rerender({ asking: false, o: failed })
    expect(result.current).toBeUndefined()
  })
})
