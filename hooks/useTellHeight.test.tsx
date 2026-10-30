import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { useRef } from "react"
import { useTellHeight } from "./useTellHeight"

// A bar or the captions over the dock tell the stage their height, which it
// makes room for (KnockBar, CallBreakoutBar and the captions in VideoConference).
let resized: (() => void) | undefined
class WatchSize {
  constructor(cb: () => void) {
    resized = cb
  }
  observe() {}
  disconnect() {
    resized = undefined
  }
}

function Told({ height, onHeight, k }: { height: number; onHeight: (px: number) => void; k?: unknown }) {
  const ref = useRef<HTMLDivElement>(null)
  useTellHeight(ref, onHeight, k)
  return <div ref={ref} data-height={height} />
}

describe("an element's height, told to the stage", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", WatchSize)
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      return { height: Number((this as HTMLElement).dataset.height ?? 0) } as DOMRect
    })
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("tells it once drawn, again as it grows, and 0 when it goes", () => {
    const onHeight = vi.fn()
    const { container, unmount } = render(<Told height={40} onHeight={onHeight} />)
    expect(onHeight).toHaveBeenLastCalledWith(40)
    ;(container.firstChild as HTMLElement).dataset.height = "96"
    act(() => resized?.())
    expect(onHeight).toHaveBeenLastCalledWith(96)
    unmount()
    expect(onHeight).toHaveBeenLastCalledWith(0)
    expect(resized).toBeUndefined()
  })

  it("measures again when the element it holds changes", () => {
    const onHeight = vi.fn()
    const { rerender } = render(<Told height={40} onHeight={onHeight} k="main" />)
    rerender(<Told height={56} onHeight={onHeight} k="room" />)
    expect(onHeight.mock.calls.map(([px]) => px)).toEqual([40, 0, 56])
  })
})
