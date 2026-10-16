import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, screen } from "@testing-library/react"

import { openMathEditor } from "./MathEditor"

// IME sweep (14 Oct 2026): Safari confirms an input method's word with an
// Enter whose keyCode is 229 and isComposing false. The equation's field read
// isComposing alone, so picking a word stored the equation and closed it.

afterEach(cleanup)

describe("the equation's field", () => {
  it("leaves an input method's Enter to pick its word, and stores on a plain one", async () => {
    const anchor = document.body.appendChild(document.createElement("span"))
    const commit = vi.fn()
    let close: (() => void) | undefined
    await act(async () => {
      close = openMathEditor({ anchor, latex: "x", display: false, preview: () => {}, commit }) as unknown as () => void
    })
    const field = await screen.findByRole("textbox", { name: "Equation, in TeX" })
    await act(async () => void fireEvent.keyDown(field, { key: "Enter", keyCode: 229 }))
    await act(async () => void fireEvent.keyDown(field, { key: "Enter", isComposing: true }))
    expect(commit).not.toHaveBeenCalled()
    await act(async () => void fireEvent.keyDown(field, { key: "Enter" }))
    expect(commit).toHaveBeenCalledTimes(1)
    if (typeof close === "function") act(() => close!())
    anchor.remove()
  })
})
