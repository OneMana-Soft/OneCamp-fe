import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { Panel, PanelGroup } from "react-resizable-panels"
import { Seam } from "./Seam"

// The real react-resizable-panels under the shell's seams (split view,
// fluid-21). Its own resize cursor was a rule for every element, added and
// taken away as a seam was hovered; and with no button pressed it measured
// every seam on the page (getBoundingClientRect) on every move of the pointer
// anywhere, the frame's layout pulled forward into the move. With the cursor
// the page's own, a bare move has nothing to do: a press finds its seam itself
// (patches/react-resizable-panels@2.1.9.patch).

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function views() {
  render(
    <PanelGroup direction="horizontal">
      <Panel defaultSize={50} />
      <Seam label="Resize views 1 and 2" />
      <Panel defaultSize={50} />
    </PanelGroup>,
  )
}

// The library's cursor rule lives in a <style> it adds to the head the first
// time a seam is hovered (jsdom keeps no sheet for it, so the element is what
// can be counted).
const styles = () => document.head.querySelectorAll("style").length

/** A primary pointer's move at x, y with no button pressed (jsdom has no PointerEvent; the library reads these fields). */
function move(x: number, y: number) {
  const e = new MouseEvent("pointermove", { clientX: x, clientY: y, buttons: 0, bubbles: true })
  Object.defineProperty(e, "isPrimary", { value: true })
  document.body.dispatchEvent(e)
}

describe("the shell's seams, while no button is pressed", () => {
  it("measure no seam as the pointer moves", () => {
    views()
    const measured = vi.spyOn(Element.prototype, "getBoundingClientRect")
    move(300, 200)
    move(0, 0)
    expect(measured).not.toHaveBeenCalled()
  })

  it("add no cursor rule for the whole page as the pointer comes over one", () => {
    views()
    // Away from it first: the library takes its rule away there, if it set one.
    move(300, 200)
    const before = styles()
    // Over the seam: jsdom lays nothing out, so every box is at 0,0.
    move(0, 0)
    expect(styles()).toBe(before)
  })
})
