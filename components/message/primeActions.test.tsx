import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"

// Since the actions toolbar is built on hover, the first hover of a session
// was its first run: one long task as the person reached for a message. The
// first row builds it once, hidden, when the browser is idle.

let idle: (() => void)[] = []

beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    idle = []
    window.requestIdleCallback = ((cb: () => void) => idle.push(cb)) as never
    window.cancelIdleCallback = (() => {}) as never
})
afterEach(() => {
    cleanup()
    vi.useRealTimers()
    // @ts-expect-error jsdom has none; each test sets its own.
    delete window.requestIdleCallback
    // @ts-expect-error as above
    delete window.cancelIdleCallback
})

describe("priming a message's actions", () => {
    it("builds them once, at idle, for the first row only, and drops them", async () => {
        const { usePrimeActions } = await import("./primeActions")
        const first = renderHook(() => usePrimeActions())
        const second = renderHook(() => usePrimeActions())
        expect(first.result.current).toBe(false)
        expect(idle).toHaveLength(1)

        act(() => idle.forEach((cb) => cb()))
        expect(first.result.current).toBe(true)
        expect(second.result.current).toBe(false)

        act(() => void vi.runAllTimers())
        expect(first.result.current).toBe(false)
    })

    it("lets the next row ask when the first is gone before the idle moment", async () => {
        const { usePrimeActions } = await import("./primeActions")
        const first = renderHook(() => usePrimeActions())
        first.unmount()
        renderHook(() => usePrimeActions())
        expect(idle).toHaveLength(2)
    })

    it("does nothing where the browser has no idle callback", async () => {
        // @ts-expect-error as in afterEach
        delete window.requestIdleCallback
        const { usePrimeActions } = await import("./primeActions")
        const row = renderHook(() => usePrimeActions())
        act(() => void vi.runAllTimers())
        expect(row.result.current).toBe(false)
    })
})
