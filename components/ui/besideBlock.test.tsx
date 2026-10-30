import { forwardRef, type ReactNode } from "react"
import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { anchorTo } from "@/components/ui/anchor"

// PopoverContent as a box that says what it was given: Radix's own placing is
// walked in a browser (e2e/anchoredCards.spec.ts).
vi.mock("@/components/ui/popover", async (actual) => ({
  ...(await actual<typeof import("@/components/ui/popover")>()),
  PopoverContent: forwardRef<HTMLDivElement, { children?: ReactNode; side?: string; align?: string; sideOffset?: number; collisionPadding?: number }>(function Box(
    { children, side, align, sideOffset, collisionPadding },
    ref,
  ) {
    return (
      <div ref={ref} data-side={side} data-align={align} data-offset={sideOffset} data-edge={collisionPadding}>
        {children}
      </div>
    )
  }),
}))

import { BesideBlockContent } from "@/components/ui/besideBlock"

// jsdom lays nothing out: the window measures 1280 px across, and a card 360.
// So a card needs 388 px on a side: 12 px off its block, 16 px in from the edge
// (EDGE_PX, every popover's).
beforeEach(() => {
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(1280)
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(360)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

let draws = 0
function Card() {
  draws++
  return <p>Launch review</p>
}
/** A card by a block from `left` to `right`. */
const cardBy = (left: number, right: number) => (
  <BesideBlockContent at={anchorTo(new DOMRect(left, 200, right - left, 56))}>
    <Card />
  </BesideBlockContent>
)
const sideOf = (c: HTMLElement) => c.querySelector("[data-side]")?.getAttribute("data-side")

describe("a card beside a block", () => {
  it("opens on the right where the window leaves it the room there", () => {
    expect(sideOf(render(cardBy(400, 600)).container)).toBe("right")
    cleanup()
    expect(sideOf(render(cardBy(400, 1280 - 388)).container)).toBe("right")
  })

  it("opens on the left when only the left has the room", () => {
    expect(sideOf(render(cardBy(900, 1200)).container)).toBe("left")
    cleanup()
    expect(sideOf(render(cardBy(388, 1280 - 387)).container)).toBe("left")
  })

  it("opens below a block as wide as the window, where neither side has the room (V-60)", () => {
    // A Day view's event: its column runs from the sidebar nearly to the window's edge.
    expect(sideOf(render(cardBy(330, 1260)).container)).toBe("bottom")
    cleanup()
    expect(sideOf(render(cardBy(387, 1280 - 387)).container)).toBe("bottom")
  })

  it("measures again by a new block", () => {
    const { container, rerender } = render(cardBy(330, 1260))
    rerender(cardBy(500, 620))
    expect(sideOf(container)).toBe("right")
    rerender(cardBy(1000, 1120))
    expect(sideOf(container)).toBe("left")
  })

  it("draws the card inside it once, though its side is found after the first draw", () => {
    draws = 0
    const { container } = render(cardBy(330, 1260))
    expect(sideOf(container)).toBe("bottom")
    expect(draws).toBe(1)
  })

  it("stands 12 px off its block at the block's start, and keeps off the window's edge as every popover does", () => {
    const box = render(cardBy(500, 620)).container.querySelector("[data-side]")!
    // No edge of its own: PopoverContent's default (EDGE_PX) holds it in, as it does every popover.
    expect([box.getAttribute("data-align"), box.getAttribute("data-offset"), box.getAttribute("data-edge")]).toEqual(["start", "12", null])
  })
})
