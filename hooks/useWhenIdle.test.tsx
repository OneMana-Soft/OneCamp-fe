import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { useWhenIdle } from "./useWhenIdle"

function Page({ run }: { run: () => void }) {
  useWhenIdle(run)
  return null
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  delete (window as { requestIdleCallback?: unknown }).requestIdleCallback
  delete (window as { cancelIdleCallback?: unknown }).cancelIdleCallback
})

describe("work for a quiet moment", () => {
  it("runs once the browser is idle, within the time given", () => {
    const idle: Array<() => void> = []
    window.requestIdleCallback = vi.fn((cb: IdleRequestCallback) => idle.push(() => cb({} as IdleDeadline))) as unknown as typeof window.requestIdleCallback
    window.cancelIdleCallback = vi.fn()
    const run = vi.fn()
    render(<Page run={run} />)
    expect(run).not.toHaveBeenCalled()
    expect(window.requestIdleCallback).toHaveBeenCalledWith(run, { timeout: 2500 })
    idle.forEach((go) => go())
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("waits a moment where there is no idle call, and not at all for a page gone first", () => {
    vi.useFakeTimers()
    const run = vi.fn()
    const { unmount } = render(<Page run={run} />)
    vi.advanceTimersByTime(1200)
    expect(run).toHaveBeenCalledTimes(1)
    const later = vi.fn()
    render(<Page run={later} />)
    cleanup()
    vi.advanceTimersByTime(5000)
    expect(later).not.toHaveBeenCalled()
    unmount()
  })
})
