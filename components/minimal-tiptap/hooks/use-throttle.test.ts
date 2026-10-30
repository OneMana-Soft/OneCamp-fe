import { afterEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useThrottle } from "./use-throttle"

// A composer's throttled update outlived the composer: its timer ran after
// unmount, and in a test after the environment's teardown, where getHTML threw
// "window is not defined" and failed a run whose every test had passed. The
// update still waiting is the last of what was typed, so it runs at unmount.
describe("useThrottle", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("runs a trailing call still waiting when the component goes, once, then and with the latest text", () => {
    vi.useFakeTimers()
    let gone = false
    const update = vi.fn<(text: string) => void>(() => {
      if (gone) throw new Error("an update ran after the composer had gone")
    })
    const { result, unmount } = renderHook(() => useThrottle(update, 300))
    act(() => {
      result.current("typed")
      result.current("typed just now")
    })
    expect(update).not.toHaveBeenCalled()
    unmount()
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenLastCalledWith("typed just now")
    gone = true
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow()
    expect(update).toHaveBeenCalledTimes(1)
  })

  it("writes nothing when the component goes after a send cancelled what was waiting", () => {
    vi.useFakeTimers()
    const update = vi.fn<(text: string) => void>()
    const { result, unmount } = renderHook(() => useThrottle(update, 300))
    act(() => result.current("sent already"))
    act(() => result.current.cancel())
    unmount()
    vi.advanceTimersByTime(1000)
    expect(update).not.toHaveBeenCalled()
  })

  it("runs the trailing call with the latest text while the component stays", () => {
    vi.useFakeTimers()
    const update = vi.fn()
    const { result } = renderHook(() => useThrottle(update, 300))
    act(() => {
      result.current("typ")
      result.current("typed")
    })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenLastCalledWith("typed")
  })
})
