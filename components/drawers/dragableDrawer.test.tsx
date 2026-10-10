import { readFileSync } from "node:fs"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import DraggableDrawer from "./dragableDrawer"

// The phone's composer sheet tweened its height for 200ms with Motion on
// every change, laying the page out on every frame: on each new line typed,
// and on every open and close. Its height now changes in one step; opening
// and closing settle by transform.

afterEach(() => cleanup())

// jsdom has no PointerEvent; Motion's drag reads the pointer's page point.
class TestPointerEvent extends MouseEvent {
  pointerType: string
  isPrimary: boolean
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerType = init.pointerType ?? "touch"
    this.isPrimary = init.isPrimary ?? true
  }
  get pageX() {
    return this.clientX
  }
  get pageY() {
    return this.clientY
  }
}
beforeAll(() => {
  if (!("PointerEvent" in window)) Object.defineProperty(window, "PointerEvent", { configurable: true, value: TestPointerEvent })
})
const frames = () => act(() => new Promise((r) => setTimeout(r, 60)))

/** A finger on the handle at y, moved to each y in turn, then lifted. */
async function drag(handle: Element, from: number, to: number[]) {
  fireEvent.pointerDown(handle, { pointerType: "touch", isPrimary: true, clientX: 200, clientY: from, button: 0 })
  for (const y of to) {
    window.dispatchEvent(new TestPointerEvent("pointermove", { pointerType: "touch", clientX: 200, clientY: y }))
    await frames()
  }
}
const lift = async (y: number) => {
  window.dispatchEvent(new TestPointerEvent("pointerup", { pointerType: "touch", clientX: 200, clientY: y }))
  await frames()
}

const sheet = (c: HTMLElement) => c.querySelector("[data-composer-sheet]") as HTMLElement

describe("the composer sheet", () => {
  it("takes the composer's height at once as it grows, and the whole screen when expanded", () => {
    const noop = () => {}
    const { container, rerender } = render(
      <DraggableDrawer initialHeight={126} isExpanded={false} setIsExpanded={noop}>
        <p>composer</p>
      </DraggableDrawer>,
    )
    expect(sheet(container).style.height).toBe("126px")
    rerender(
      <DraggableDrawer initialHeight={148} isExpanded={false} setIsExpanded={noop}>
        <p>composer</p>
      </DraggableDrawer>,
    )
    // Synchronously: no tween in between.
    expect(sheet(container).style.height).toBe("148px")
    rerender(
      <DraggableDrawer initialHeight={148} isExpanded={true} setIsExpanded={noop}>
        <p>composer</p>
      </DraggableDrawer>,
    )
    expect(sheet(container).style.height).toBe("100dvh")
  })

  it("sizes the whole sheet, so its top is where --mobile-drawer-h says, home-indicator padding inside", () => {
    const { container } = render(
      <DraggableDrawer initialHeight={126} isExpanded={false} setIsExpanded={() => {}}>
        <p>composer</p>
      </DraggableDrawer>,
    )
    const el = sheet(container)
    expect(el.className).toMatch(/\bfixed\b/)
    expect(el.className).toContain("pb-[env(safe-area-inset-bottom)]")
    expect(el.style.height).toBe("126px")
    expect(document.documentElement.style.getPropertyValue("--mobile-drawer-h")).toBe("126px")
  })

  it("follows the finger, and a drag let go short of the threshold keeps the state's height", async () => {
    const setIsExpanded = vi.fn()
    const { container } = render(
      <DraggableDrawer initialHeight={126} isExpanded={false} setIsExpanded={setIsExpanded}>
        <p>composer</p>
      </DraggableDrawer>,
    )
    const el = sheet(container)
    await drag(el.firstElementChild!, 600, [590, 580, 560])
    // 40px up: the sheet grew with the finger.
    expect(el.style.height).toBe("166px")
    await lift(560)
    expect(setIsExpanded).not.toHaveBeenCalled()
    // Back to the composer's height, not left at none (React would not write
    // a style prop that had not changed).
    expect(el.style.height).toBe("126px")
  })

  it("expands on a long drag up", async () => {
    const setIsExpanded = vi.fn()
    const { container } = render(
      <DraggableDrawer initialHeight={126} isExpanded={false} setIsExpanded={setIsExpanded}>
        <p>composer</p>
      </DraggableDrawer>,
    )
    const el = sheet(container)
    await drag(el.firstElementChild!, 700, [650, 500, 300])
    await lift(300)
    expect(setIsExpanded).toHaveBeenCalledWith(true)
  })

  it("reads the window's size in no render: each read forced a layout while the page was changing", () => {
    let reads = 0
    const real = Object.getOwnPropertyDescriptor(window, "innerHeight")
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      get: () => {
        reads++
        return 844
      },
    })
    try {
      const el = (n: number) => (
        <DraggableDrawer initialHeight={126} isExpanded={false} setIsExpanded={() => {}}>
          <p>composer {n}</p>
        </DraggableDrawer>
      )
      const { rerender } = render(el(0))
      const settled = reads
      for (let n = 1; n <= 5; n++) rerender(el(n))
      expect(reads - settled, "a render read window.innerHeight").toBe(0)
    } finally {
      if (real) Object.defineProperty(window, "innerHeight", real)
    }
  })

  it("publishes its height as the composer grows without reading the window's", () => {
    let reads = 0
    const real = Object.getOwnPropertyDescriptor(window, "innerHeight")
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      get: () => {
        reads++
        return 844
      },
    })
    try {
      const el = (h: number) => (
        <DraggableDrawer initialHeight={h} isExpanded={false} setIsExpanded={() => {}}>
          <p>composer</p>
        </DraggableDrawer>
      )
      const { rerender } = render(el(126))
      for (const h of [148, 170, 192]) rerender(el(h))
      expect(document.documentElement.style.getPropertyValue("--mobile-drawer-h")).toBe("192px")
      expect(reads, "each new line read window.innerHeight").toBe(0)
    } finally {
      if (real) Object.defineProperty(window, "innerHeight", real)
    }
  })

  it("is never taller than the screen", () => {
    const { container } = render(
      <DraggableDrawer initialHeight={2000} isExpanded={false} setIsExpanded={() => {}}>
        <p>composer</p>
      </DraggableDrawer>,
    )
    expect(sheet(container).className).toMatch(/\bmax-h-dvh\b/)
  })

  it("animates no layout property: no height in a Motion animation, a settle on y only", () => {
    const src = readFileSync("components/drawers/dragableDrawer.tsx", "utf8")
    const code = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
    expect(code).not.toMatch(/(?:initial|animate|exit)=\{\{[^}]*\bheight\b/)
    expect(code).not.toMatch(/\.(?:start|set)\(\s*\{[^}]*\bheight\b/)
    expect(code).toMatch(/settle\.start\(\s*\{\s*y:/)
    expect(code).toMatch(/if \(reduceMotion\) return/)
  })
})
