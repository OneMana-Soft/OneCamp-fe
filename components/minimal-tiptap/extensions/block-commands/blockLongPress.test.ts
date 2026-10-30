import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { fireEvent } from "@testing-library/react"

import { docEditor, loadDocBlocks } from "./blockTestKit"
import { answerBlockMenu } from "./menuRequest"

// A phone's long press on a block opens the block's sheet. The click its
// release sends is swallowed wherever it lands, as every long press's is
// (hooks/useLongPress): a menu sheet grows to 92dvh, so by then the sheet's
// own item is under the finger, and it ran (Move down, Delete) and closed the
// sheet it had just opened.

beforeAll(loadDocBlocks, 60_000)
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("a long press on a block", () => {
  it("opens the block's sheet, and the click its release sends runs nothing under the finger", () => {
    vi.useFakeTimers()
    const e = docEditor("<p>one</p><p>two</p>")
    const asked = vi.fn()
    answerBlockMenu(e, asked)
    // jsdom has no layout: the finger's point is in "two".
    vi.spyOn(e.view, "posAtCoords").mockReturnValue({ pos: 7, inside: -1 })
    const item = document.body.appendChild(document.createElement("button"))
    const ran = vi.fn()
    item.addEventListener("click", ran)
    // jsdom has no PointerEvent: a finger's, as the browser sends it.
    const finger = (type: "pointerdown" | "pointerup") => {
      const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 40, clientY: 30 })
      Object.defineProperties(ev, { pointerType: { value: "touch" }, isPrimary: { value: true }, pointerId: { value: 1 } })
      e.view.dom.dispatchEvent(ev)
    }
    try {
      finger("pointerdown")
      vi.advanceTimersByTime(500)
      expect(asked).toHaveBeenCalledWith(expect.objectContaining({ via: "press", blocks: [5] }))
      finger("pointerup")
      fireEvent.click(item)
      expect(ran).not.toHaveBeenCalled()
      // The next touch is a tap of its own, and keeps its click.
      fireEvent.touchStart(item)
      fireEvent.click(item)
      expect(ran).toHaveBeenCalledTimes(1)
    } finally {
      item.remove()
    }
  })
})
