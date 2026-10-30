import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import * as React from "react"

import { useGiveWay } from "./useGiveWay"

// jsdom lays nothing out, so each box says its widths in data attributes: a box is data-width px wide,
// and a row's inside is data-inside px, narrower by data-step px with each step given (data-given).
beforeEach(() => {
  vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(function (this: Element) {
    return Number((this as HTMLElement).dataset.width ?? 0)
  })
  vi.spyOn(Element.prototype, "scrollWidth", "get").mockImplementation(function (this: Element) {
    const { width = "0", inside, step = "0", given = "0" } = (this as HTMLElement).dataset
    return inside === undefined ? Number(width) : Math.max(Number(width), Number(inside) - Number(step) * Number(given))
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function Row({ inside, step, room, max, parts }: { inside: number; step: number; room: number; max: number; parts: string }) {
  const row = React.useRef<HTMLDivElement>(null)
  // The room is an element, not a ref: a room drawn after the row is watched from the moment it is.
  const [space, setSpace] = React.useState<HTMLDivElement | null>(null)
  const given = useGiveWay(row, space, max, parts)
  return (
    <>
      <div ref={setSpace} data-width={room} />
      <div ref={row} data-testid="row" data-width={room} data-inside={inside} data-step={step} data-given={given} />
    </>
  )
}
const given = () => Number(screen.getByTestId("row").dataset.given)

describe("useGiveWay: the steps a row gives way by to draw whole", () => {
  it("takes the fewest steps that draw the row whole, before it is painted", () => {
    render(<Row inside={400} step={40} room={330} max={5} parts="a" />)
    expect(given()).toBe(2)
  })

  it("stops at its last step when no step is enough", () => {
    render(<Row inside={600} step={10} room={330} max={3} parts="a" />)
    expect(given()).toBe(3)
  })

  it("draws a row with no steps whole: a computer's bar", () => {
    render(<Row inside={400} step={40} room={330} max={0} parts="a" />)
    expect(given()).toBe(0)
  })

  it("draws new parts whole first, then steps down from there", () => {
    const { rerender } = render(<Row inside={400} step={40} room={330} max={5} parts="a" />)
    expect(given()).toBe(2)
    rerender(<Row inside={300} step={40} room={330} max={5} parts="b" />)
    expect(given()).toBe(0)
    rerender(<Row inside={500} step={50} room={330} max={5} parts="c" />)
    expect(given()).toBe(4)
  })

  it("counts again from the whole forms when its room changes width, wider or narrower", () => {
    const watchers: (() => void)[] = []
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          watchers.push(cb)
        }
        observe() {}
        disconnect() {}
      },
    )
    const { rerender } = render(<Row inside={400} step={40} room={330} max={5} parts="a" />)
    expect(given()).toBe(2)
    // The first report of a box is its size as it was found: no count again.
    act(() => watchers.forEach((w) => w()))
    expect(given()).toBe(2)
    rerender(<Row inside={400} step={40} room={500} max={5} parts="a" />)
    act(() => watchers.forEach((w) => w()))
    expect(given()).toBe(0)
    rerender(<Row inside={400} step={40} room={300} max={5} parts="a" />)
    act(() => watchers.forEach((w) => w()))
    expect(given()).toBe(3)
  })

  it("counts again when its fonts arrive, as the words' widths change", () => {
    const heard: Record<string, () => void> = {}
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { addEventListener: (type: string, f: () => void) => (heard[type] = f), removeEventListener: () => {} },
    })
    try {
      const { rerender } = render(<Row inside={400} step={40} room={330} max={5} parts="a" />)
      expect(given()).toBe(2)
      // The webfont is in: the same words are narrower.
      rerender(<Row inside={320} step={40} room={330} max={5} parts="a" />)
      act(() => heard.loadingdone?.())
      expect(given()).toBe(0)
    } finally {
      delete (document as { fonts?: unknown }).fonts
    }
  })
})
