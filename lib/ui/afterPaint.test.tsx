import { afterEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useAfterPaint } from "@/lib/ui/afterPaint"

// Frames and tasks by hand: a frame's callbacks run before it paints, a task queued from one after.
const fake = () => vi.useFakeTimers({ now: new Date("2026-10-15T12:00:00Z"), toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout"] })

afterEach(() => {
  vi.useRealTimers()
})

describe("useAfterPaint", () => {
  it("stays false while it is not armed, however many frames pass", () => {
    fake()
    const { result } = renderHook(() => useAfterPaint(false))
    act(() => vi.advanceTimersByTime(100))
    expect(result.current).toBe(false)
  })

  it("turns true only after the frame that follows its arming has painted, and stays true", () => {
    fake()
    const { result, rerender } = renderHook(({ armed }) => useAfterPaint(armed), { initialProps: { armed: false } })
    rerender({ armed: true })
    expect(result.current).toBe(false)
    // The frame's callback: still before the paint.
    act(() => vi.advanceTimersToNextFrame())
    expect(result.current).toBe(false)
    // The task after it: the frame has painted.
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(true)
    rerender({ armed: false })
    expect(result.current).toBe(true)
  })

  it("leaves nothing behind when it unmounts before the frame", () => {
    fake()
    const { result, unmount } = renderHook(() => useAfterPaint(true))
    unmount()
    act(() => vi.advanceTimersByTime(100))
    expect(result.current).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
