import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"

import { useNow } from "./useNow"

// V-9: the one ticking clock every clock on a call's screen runs on.
describe("useNow", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-28T10:00:00Z"))
  })
  afterEach(() => vi.useRealTimers())

  it("ticks every second while on, and stops when off", () => {
    const t0 = Date.now()
    const { result, rerender } = renderHook(({ on }) => useNow(on), { initialProps: { on: true } })
    expect(result.current).toBe(t0)
    act(() => vi.advanceTimersByTime(3000))
    expect(result.current).toBe(t0 + 3000)
    rerender({ on: false })
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current, "off, it keeps its last reading").toBe(t0 + 3000)
    expect(vi.getTimerCount(), "and runs no timer").toBe(0)
  })

  it("reads now at once when it turns on, not from when it mounted", () => {
    const { result, rerender } = renderHook(({ on }) => useNow(on), { initialProps: { on: false } })
    act(() => vi.advanceTimersByTime(60_000))
    rerender({ on: true })
    expect(result.current).toBe(new Date("2026-10-28T10:01:00Z").getTime())
  })

  it("ticks as often as asked", () => {
    const t0 = Date.now()
    const { result } = renderHook(() => useNow(true, 30_000))
    act(() => vi.advanceTimersByTime(29_000))
    expect(result.current).toBe(t0)
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current).toBe(t0 + 30_000)
  })
})
