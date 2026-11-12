import { useRef, useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"

import { useWindowedRows } from "@/lib/ui/useWindowedRows"
import { layFlow } from "@/lib/ui/windowedRows"

// A windowed list's offset in the scroller it shares with what is above it
// (the virtualizer's scrollMargin) is read again as anything in the scroller
// changes size. A section a page adds above the list later (B-2's) was never
// watched, so as it grew the window drew the wrong rows.
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const FLOW = layFlow(Array.from({ length: 300 }, (_, i) => ({ key: `t${i}`, group: "todo", size: 40 })))

function Page() {
  const [scroller, setScroller] = useState<HTMLElement | null>(null)
  const list = useRef<HTMLDivElement>(null)
  useWindowedRows({ flow: FLOW, list, scroller })
  return (
    <div ref={setScroller} data-testid="scroller">
      <div ref={list} />
    </div>
  )
}

describe("a list windowed in a scroller it shares", () => {
  it("watches a section added above it later, and reads its offset again", async () => {
    const watched = new Set<Element>()
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(el: Element) {
          watched.add(el)
        }
        unobserve(el: Element) {
          watched.delete(el)
        }
        disconnect() {
          watched.clear()
        }
      },
    )
    const offsets = vi.spyOn(Element.prototype, "getBoundingClientRect")
    render(<Page />)
    const scroller = screen.getByTestId("scroller")
    await waitFor(() => expect(watched.has(scroller)).toBe(true))
    const read = offsets.mock.calls.length
    const section = document.createElement("section")
    act(() => scroller.prepend(section))
    await waitFor(() => expect(watched.has(section)).toBe(true))
    expect(offsets.mock.calls.length).toBeGreaterThan(read)
  })
})

// A list hands the window its scroller late (listWindow: once it passes 200
// rows, as "Show N more" is pressed), when the reader may already be far down
// the page. The virtualizer scrolled a scroller it was handed to the offset it
// had cached before it had one (0), so the page jumped to its top (F1, 8 Nov).
type Win = { first: number; last: number } | null

function Late({ scroller, onWindow }: { scroller: HTMLElement | null; onWindow: (w: Win) => void }) {
  const list = useRef<HTMLDivElement>(null)
  const { window: w } = useWindowedRows({ flow: FLOW, list, scroller })
  onWindow(w)
  return <div ref={list} />
}

const rect = (y: number, height: number) => ({ x: 0, y, top: y, left: 0, right: 1024, bottom: y + height, width: 1024, height, toJSON: () => ({}) }) as DOMRect

describe("a list handed its scroller late", () => {
  it("leaves the scroller where the reader is, and plans the window there", () => {
    let top = 1934
    const writes: number[] = []
    const scroller = document.createElement("div")
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      get: () => top,
      set: (v: number) => {
        writes.push(v)
        top = v
      },
    })
    for (const [k, v] of [["clientHeight", 800], ["offsetHeight", 800], ["clientWidth", 1024], ["offsetWidth", 1024]] as const)
      Object.defineProperty(scroller, k, { configurable: true, get: () => v })
    // A browser's scrollTo moves the scroller: so does this one.
    scroller.scrollTo = vi.fn((o?: ScrollToOptions | number) => {
      const to = typeof o === "number" ? o : o?.top
      if (to !== undefined) {
        writes.push(to)
        top = to
      }
    }) as unknown as typeof scroller.scrollTo
    document.body.append(scroller)
    // The list starts at the scroller's top, so scrolled to `top` its box sits `top` above it.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      return this === scroller ? rect(0, 800) : rect(-top, 12000)
    })

    const seen: Win[] = []
    const { rerender } = render(<Late scroller={null} onWindow={(w) => seen.push(w)} />)
    rerender(<Late scroller={scroller} onWindow={(w) => seen.push(w)} />)

    expect(writes.filter((t) => t !== 1934)).toEqual([])
    expect(top).toBe(1934)
    const w = seen.at(-1)
    expect(w?.first).toBeGreaterThan(0)
    // Row 48 (1920-1960) is at the screen's top, row 68 at its foot.
    expect(w!.first).toBeLessThanOrEqual(48)
    expect(w!.last).toBeGreaterThanOrEqual(68)
    scroller.remove()
  })
})
