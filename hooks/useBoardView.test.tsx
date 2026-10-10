import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { useBoardView } from "./useBoardView"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function fakeBoard() {
  const state = { scrollX: 0, scrollY: 0, zoom: { value: 1 }, width: 800, height: 600, offsetLeft: 0, offsetTop: 0 }
  const scroll = new Set<() => void>()
  const change = new Set<() => void>()
  return {
    state,
    scroll,
    change,
    api: {
      getAppState: () => state,
      onScrollChange: (cb: () => void) => (scroll.add(cb), () => scroll.delete(cb)),
      onChange: (cb: () => void) => (change.add(cb), () => change.delete(cb)),
    } as never,
  }
}

describe("useBoardView", () => {
  it("does nothing for a consumer with nothing to place", () => {
    const raf = vi.spyOn(window, "requestAnimationFrame")
    const b = fakeBoard()
    const { result } = renderHook(() => useBoardView(b.api, false))
    expect(result.current).toBeNull()
    expect(b.scroll.size + b.change.size).toBe(0)
    expect(raf).not.toHaveBeenCalled()
  })

  it("asks for no frames while the board is still, and reads a pan once a frame", () => {
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => frames.push(cb))
    const b = fakeBoard()
    const { result } = renderHook(() => useBoardView(b.api, true))
    expect(result.current?.scrollX).toBe(0)
    // Still: no polling.
    expect(frames).toHaveLength(0)
    // A pan: ten scroll events before the next frame make one read.
    b.state.scrollX = -120
    for (let i = 0; i < 10; i++) b.scroll.forEach((cb) => cb())
    expect(frames).toHaveLength(1)
    act(() => frames.shift()!(0))
    expect(result.current?.scrollX).toBe(-120)
  })

  it("stops listening when it is turned off or unmounted", () => {
    const b = fakeBoard()
    const { rerender, unmount } = renderHook(({ on }) => useBoardView(b.api, on), { initialProps: { on: true } })
    expect(b.scroll.size).toBe(1)
    rerender({ on: false })
    expect(b.scroll.size).toBe(0)
    rerender({ on: true })
    unmount()
    expect(b.scroll.size + b.change.size).toBe(0)
  })
})
