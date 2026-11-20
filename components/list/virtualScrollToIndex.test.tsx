// CR-330 F5: the player opens its transcript at a call's moment by scrolling the shared list to that line. The
// list scrolled once, as the row arrived, while the sheet's transcript panel had no height yet: with a 0 viewport
// every row counts as out of view, so even "nearest" moved a three-line list through its end room and clipped
// line 1's speaker. The list now waits (a frame at a time, capped) for a viewport, then moves the row only when
// it lies outside it, to the nearest edge.
import { act, cleanup, render } from "@testing-library/react"
import { forwardRef, useImperativeHandle, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const scrolled = vi.hoisted(() => [] as unknown[][])
// Rows are 40 px tall; the viewport and scroll offset are what each case sets. `scrolled` holds the calls that
// move the list: as in virtua 0.41, "nearest" leaves a row that lies inside scrollOffset..+viewportSize, so with
// a 0 viewport every row moves (the clipped header); any other align always moves.
const { view, inView } = vi.hoisted(() => {
  const view = { viewportSize: 0, scrollOffset: 0 }
  return { view, inView: (i: number) => i * 40 >= view.scrollOffset && i * 40 + 40 <= view.scrollOffset + view.viewportSize }
})
vi.mock("virtua", async (real) => ({
  ...(await real<typeof import("virtua")>()),
  VList: forwardRef(function VList({ children }: { children: ReactNode }, ref) {
    useImperativeHandle(ref, () => ({
      scrollToIndex: (i: number, o?: { align?: string }) => { if (!(o?.align === "nearest" && inView(i))) scrolled.push([i, o]) },
      scrollTo: () => {},
      scrollBy: () => {},
      get viewportSize() { return view.viewportSize },
      get scrollOffset() { return view.scrollOffset },
      getItemOffset: (i: number) => i * 40,
      getItemSize: () => 40,
    }))
    return <div>{children}</div>
  }),
}))

import { VirtualInfiniteScroll } from "./virtualInfiniteScroll"

const frames: (FrameRequestCallback | null)[] = []
const nextFrames = (n: number) => act(() => {
  for (let i = 0; i < n; i++) frames.splice(0).forEach((f) => f?.(0))
})

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => frames.push(f))
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames[id - 1] = null })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  scrolled.length = 0
  frames.length = 0
  Object.assign(view, { viewportSize: 0, scrollOffset: 0 })
})

const lines = ["Morning, everyone.", "Let's ship the beta on Friday.", "The notes go out Monday."]
const list = (scrollToIndex?: number) => (
  <VirtualInfiniteScroll items={lines} renderItem={(t: string) => <p>{t}</p>} onLoadMore={() => {}} isLoading={false} hasMore={false} keyExtractor={(t: string) => t} scrollToIndex={scrollToIndex} />
)

describe("a list opened at one of its rows", () => {
  it("leaves a row already in view where it is", async () => {
    Object.assign(view, { viewportSize: 400, scrollOffset: 0 })
    render(list(1))
    await nextFrames(3)
    expect(scrolled).toEqual([])
  })

  it("moves a row out of view to the nearest edge", async () => {
    Object.assign(view, { viewportSize: 60, scrollOffset: 0 })
    render(list(2))
    await nextFrames(3)
    expect(scrolled).toEqual([[2, { align: "nearest" }]])
  })

  it("scrolls once per row asked for, and not at all with none", async () => {
    Object.assign(view, { viewportSize: 60, scrollOffset: 0 })
    const { rerender } = render(list())
    await nextFrames(2)
    expect(scrolled).toEqual([])
    rerender(list(2))
    await nextFrames(2)
    rerender(list(2))
    await nextFrames(2)
    expect(scrolled).toEqual([[2, { align: "nearest" }]])
  })
})
