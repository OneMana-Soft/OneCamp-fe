import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { SLOW_AFTER_MS, useSlowAfter } from "./useSlowAfter"

// Something on its way for too long says so (V-180: an event panel opened cold sat blank for 30 s). The count runs
// only while it waits, starts over when it waits again, and again() gives a Try again a fresh count.

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const hook = (waiting: boolean, ms = 1_000) => renderHook((p: { waiting: boolean; ms: number }) => useSlowAfter(p.waiting, p.ms), { initialProps: { waiting, ms } })

describe("useSlowAfter", () => {
  it("is slow once it has waited the whole time, and not a moment before", () => {
    const { result } = hook(true)
    act(() => vi.advanceTimersByTime(999))
    expect(result.current[0]).toBe(false)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current[0]).toBe(true)
  })

  it("never counts while nothing waits", () => {
    const { result } = hook(false)
    act(() => vi.advanceTimersByTime(5_000))
    expect(result.current[0]).toBe(false)
  })

  it("stops being slow as soon as it no longer waits, and counts from the start when it waits again", () => {
    const { result, rerender } = hook(true)
    act(() => vi.advanceTimersByTime(1_000))
    expect(result.current[0]).toBe(true)
    rerender({ waiting: false, ms: 1_000 })
    expect(result.current[0]).toBe(false)
    rerender({ waiting: true, ms: 1_000 })
    expect(result.current[0]).toBe(false)
    act(() => vi.advanceTimersByTime(999))
    expect(result.current[0]).toBe(false)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current[0]).toBe(true)
  })

  it("gives a Try again a fresh count: again() is no longer slow, until the whole time has passed once more", () => {
    const { result } = hook(true)
    act(() => vi.advanceTimersByTime(1_000))
    expect(result.current[0]).toBe(true)
    act(() => result.current[1]())
    expect(result.current[0]).toBe(false)
    act(() => vi.advanceTimersByTime(999))
    expect(result.current[0]).toBe(false)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current[0]).toBe(true)
  })

  it("leaves no timer behind when it goes", () => {
    const { unmount } = hook(true)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("calls a load slow at 10 s, the app's one limit", () => {
    expect(SLOW_AFTER_MS).toBe(10_000)
  })
})
