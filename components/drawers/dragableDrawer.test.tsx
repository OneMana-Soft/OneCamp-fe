import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import DraggableDrawer from "./dragableDrawer"

// The phone's composer sheet tweened its height for 200ms with Motion on
// every change, laying the page out on every frame: on each new line typed,
// and on every open and close. Its height now changes in one step; opening
// and closing settle by transform.

afterEach(() => cleanup())

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

  it("animates no layout property: no height in a Motion animation, a settle on y only", () => {
    const src = readFileSync("components/drawers/dragableDrawer.tsx", "utf8")
    const code = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
    expect(code).not.toMatch(/(?:initial|animate|exit)=\{\{[^}]*\bheight\b/)
    expect(code).not.toMatch(/\.(?:start|set)\(\s*\{[^}]*\bheight\b/)
    expect(code).toMatch(/settle\.start\(\s*\{\s*y:/)
    expect(code).toMatch(/if \(reduceMotion\) return/)
  })
})
