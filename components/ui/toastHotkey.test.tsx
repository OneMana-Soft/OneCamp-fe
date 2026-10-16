import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, render } from "@testing-library/react"

import { ToastProvider, ToastViewport, isToastHotkey } from "./toast"

// ⌥T takes focus to the toasts (shell T1). It also fired while typing: in a
// doc ⌘⌥T (Notion's "open every toggle") and, on a Mac, ⌥T (the "†" key)
// threw focus out of the text. Now it fires only when nobody is typing, and
// only on ⌥T alone.

afterEach(cleanup)

function altT(target: EventTarget, extra: KeyboardEventInit = {}) {
  const e = new KeyboardEvent("keydown", { key: "t", code: "KeyT", altKey: true, bubbles: true, cancelable: true, ...extra })
  act(() => {
    target.dispatchEvent(e)
  })
}

function mount() {
  render(
    <ToastProvider>
      <ToastViewport />
      <input aria-label="A field" />
      <div contentEditable suppressContentEditableWarning aria-label="An editor">text</div>
    </ToastProvider>,
  )
  return document.querySelector<HTMLElement>(".toast-viewport")!
}

describe("the toasts' hotkey", () => {
  it("takes focus to the toasts from the page", () => {
    const viewport = mount()
    altT(document.body)
    expect(document.activeElement).toBe(viewport)
  })

  it("never fires while typing in a field or an editor", () => {
    const viewport = mount()
    const field = document.querySelector<HTMLElement>("input")!
    field.focus()
    altT(field)
    expect(document.activeElement).toBe(field)
    const editor = document.querySelector<HTMLElement>("[contenteditable]")!
    editor.focus()
    altT(editor)
    expect(document.activeElement).not.toBe(viewport)
  })

  it("is ⌥T alone: ⌘⌥T, Ctrl+Alt+T and ⇧⌥T are someone else's", () => {
    const viewport = mount()
    altT(document.body, { metaKey: true })
    altT(document.body, { ctrlKey: true })
    altT(document.body, { shiftKey: true })
    expect(document.activeElement).not.toBe(viewport)
    expect(isToastHotkey({ altKey: true, metaKey: false, ctrlKey: false, shiftKey: false, code: "KeyT", target: document.body, defaultPrevented: false })).toBe(true)
  })
})
