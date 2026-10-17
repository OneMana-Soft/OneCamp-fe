import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { fieldKeyDown, isComposingKey } from "./ime"

afterEach(cleanup)

// Typing Japanese, Chinese or Korean, Enter picks the word being made and
// Escape drops it: neither is the field's (review, 15 Oct 2026).
describe("isComposingKey", () => {
  it("knows a key mid-word, Safari's Enter (keyCode 229, not isComposing) too", () => {
    expect(isComposingKey({ isComposing: true, keyCode: 13 })).toBe(true)
    expect(isComposingKey({ isComposing: false, keyCode: 229 })).toBe(true)
    expect(isComposingKey({ isComposing: false, keyCode: 13 })).toBe(false)
  })
})

describe("fieldKeyDown", () => {
  it("leaves an input method's Enter and Escape to it, and hands every other key to the field", () => {
    const heard = vi.fn()
    render(<input aria-label="Name" onKeyDown={fieldKeyDown((e) => heard(e.key))} />)
    const box = screen.getByLabelText("Name")
    fireEvent.keyDown(box, { key: "Enter", isComposing: true })
    fireEvent.keyDown(box, { key: "Enter", keyCode: 229 })
    fireEvent.keyDown(box, { key: "Escape", isComposing: true })
    expect(heard).not.toHaveBeenCalled()
    fireEvent.keyDown(box, { key: "Enter" })
    fireEvent.keyDown(box, { key: "Escape" })
    fireEvent.keyDown(box, { key: "a" })
    expect(heard.mock.calls.map(([k]) => k)).toEqual(["Enter", "Escape", "a"])
  })
})
