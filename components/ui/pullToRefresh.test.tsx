import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { useRef } from "react"

const mutate = vi.fn((...args: unknown[]) => Promise.resolve(args.slice(0, 0)))
vi.mock("@/lib/swrMutate", () => ({ appMutate: (...args: unknown[]) => mutate(...args) }))

import { PULL_ARM, PULL_MAX, PULL_REST, PullIndicator, pullDistance, pullProgress, usePullToRefresh } from "./pullToRefresh"

// Design v3, mobile L4: pull to refresh on a tab's list.

afterEach(() => {
  cleanup()
  mutate.mockClear()
})

describe("the pull's resistance", () => {
  it("follows the finger less the further it goes, and never past 120", () => {
    expect(pullDistance(0)).toBe(0)
    expect(pullDistance(-20)).toBe(0)
    expect(pullDistance(40)).toBeLessThan(40)
    expect(pullDistance(1000)).toBeLessThanOrEqual(PULL_MAX)
    expect(pullDistance(60)).toBeLessThan(pullDistance(120))
  })

  it("arms at 72px, a comfortable pull, and rests at 56 while it refreshes", () => {
    expect(PULL_ARM).toBe(72)
    expect(PULL_REST).toBe(56)
    // About 110px of finger reaches the arm.
    expect(pullDistance(105)).toBeLessThan(PULL_ARM)
    expect(pullDistance(115)).toBeGreaterThanOrEqual(PULL_ARM)
    expect(pullProgress(36)).toBe(0.5)
    expect(pullProgress(200)).toBe(1)
  })
})

function touch(el: Element, type: string, y: number, x = 100) {
  const ev = new Event(type, { bubbles: true, cancelable: true }) as Event & { touches: { clientX: number; clientY: number }[] }
  Object.defineProperty(ev, "touches", { value: type === "touchend" ? [] : [{ clientX: x, clientY: y }] })
  el.dispatchEvent(ev)
  return ev
}

function Harness({ onRefresh, onError, scrollTop = 0 }: { onRefresh: () => Promise<unknown>; onError?: () => void; scrollTop?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const pull = usePullToRefresh(ref, { enabled: true, onRefresh, onError })
  return (
    <>
      <PullIndicator {...pull} />
      <div
        ref={(el) => {
          ref.current = el
          if (el) Object.defineProperty(el, "scrollTop", { value: scrollTop, configurable: true })
        }}
        data-testid="scroller"
      />
    </>
  )
}

describe("a pull, end to end", () => {
  it("refreshes when let go past the arm, and the ring says so", async () => {
    vi.useFakeTimers()
    const onRefresh = vi.fn(() => Promise.resolve())
    const { getByTestId, container } = render(<Harness onRefresh={onRefresh} />)
    const el = getByTestId("scroller")
    expect(container.querySelector("[data-pull-indicator]"), "a ring at rest").toBeNull()
    act(() => {
      touch(el, "touchstart", 0)
    })
    let move!: Event
    act(() => {
      move = touch(el, "touchmove", 200)
    })
    expect(move.defaultPrevented, "the page bounced under the pull").toBe(true)
    expect(container.querySelector("[data-pull-indicator]")?.getAttribute("data-state")).toBe("armed")
    await act(async () => {
      touch(el, "touchend", 200)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(container.querySelector("[data-pull-indicator]")?.getAttribute("data-state")).toBe("done")
    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    expect(container.querySelector("[data-pull-indicator]")).toBeNull()
    vi.useRealTimers()
  })

  it("goes home without refreshing when let go short of the arm", () => {
    const onRefresh = vi.fn(() => Promise.resolve())
    const { getByTestId, container } = render(<Harness onRefresh={onRefresh} />)
    const el = getByTestId("scroller")
    act(() => {
      touch(el, "touchstart", 0)
      touch(el, "touchmove", 40)
    })
    expect(container.querySelector("[data-pull-indicator]")?.getAttribute("data-state")).toBe("pulling")
    act(() => {
      touch(el, "touchend", 40)
    })
    expect(onRefresh).not.toHaveBeenCalled()
    expect(container.querySelector("[data-pull-indicator]")).toBeNull()
  })

  it("shows the error and then tells the caller", async () => {
    vi.useFakeTimers()
    const onError = vi.fn()
    const { getByTestId, container } = render(<Harness onRefresh={() => Promise.reject(new Error("offline"))} onError={onError} />)
    const el = getByTestId("scroller")
    act(() => {
      touch(el, "touchstart", 0)
      touch(el, "touchmove", 220)
    })
    await act(async () => {
      touch(el, "touchend", 220)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.querySelector("[data-pull-indicator]")?.getAttribute("data-state")).toBe("error")
    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    expect(onError).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it("never starts while the list is scrolled", () => {
    const onRefresh = vi.fn(() => Promise.resolve())
    const { getByTestId, container } = render(<Harness onRefresh={onRefresh} scrollTop={120} />)
    const el = getByTestId("scroller")
    let move!: Event
    act(() => {
      touch(el, "touchstart", 0)
      move = touch(el, "touchmove", 200)
    })
    expect(move.defaultPrevented).toBe(false)
    expect(container.querySelector("[data-pull-indicator]")).toBeNull()
  })

  it("leaves a sideways drag to whatever scrolls sideways", () => {
    const onRefresh = vi.fn(() => Promise.resolve())
    const { getByTestId, container } = render(<Harness onRefresh={onRefresh} />)
    const el = getByTestId("scroller")
    act(() => {
      touch(el, "touchstart", 0, 100)
      touch(el, "touchmove", 20, 200)
    })
    expect(container.querySelector("[data-pull-indicator]")).toBeNull()
  })
})

describe("what a pull asks again", () => {
  it("revalidates the lists on screen through the app's mutate, never SWR's global one", async () => {
    const { refreshOnScreen } = await import("@/lib/ui/refreshOnScreen")
    await refreshOnScreen()
    expect(mutate).toHaveBeenCalledTimes(1)
    const matcher = mutate.mock.calls[0][0] as (k: unknown) => boolean
    expect(typeof matcher).toBe("function")
    expect(matcher("/api/channels")).toBe(true)
    expect(matcher(undefined)).toBe(false)
  })
})
