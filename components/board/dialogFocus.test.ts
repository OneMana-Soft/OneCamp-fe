import { renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { keepDialogFocus, useKeptDialogFocus } from "./dialogFocus"

// Excalidraw's image dialog as the keeper meets it: its content (focusable, as Excalidraw makes it) holding the
// file's name and the picture buttons, beside a control on the page outside any dialog.
function page() {
  const root = document.createElement("div")
  root.innerHTML = `
    <button id="board">Board</button>
    <div class="Modal" role="dialog"><div class="Modal__content" tabindex="0">
      <input id="name" /><button id="png">PNG</button><button id="svg">SVG</button>
    </div></div>`
  document.body.append(root)
  const el = <T extends HTMLElement = HTMLButtonElement>(id: string) => root.querySelector<T>(`#${id}`)!
  return { root, content: root.querySelector<HTMLElement>(".Modal__content")!, board: el("board"), name: el<HTMLInputElement>("name"), png: el("png"), svg: el("svg") }
}

/**
 * What a browser does to a control that is disabled while it has focus: focus drops to the page, and its focusout
 * is heard with the control already disabled. jsdom keeps focus on a disabled control, so the control is blurred
 * here and disabled as its focusout starts, at the window, before the keeper on the document hears it.
 */
function disableFocused(control: HTMLButtonElement) {
  const disable = (e: Event) => void (e.target === control && (control.disabled = true))
  window.addEventListener("focusout", disable, true)
  control.blur()
  window.removeEventListener("focusout", disable, true)
}

// The keeper hears a control come back through a MutationObserver, which reports after the change.
const settled = () => new Promise((r) => setTimeout(r, 0))

let off = () => {}
afterEach(() => {
  off()
  off = () => {}
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe("keepDialogFocus", () => {
  it("hands a disabled control's focus to its dialog, and gives it back once the control is enabled again", async () => {
    const { content, png } = page()
    off = keepDialogFocus()
    png.focus()
    disableFocused(png)
    expect(document.activeElement).toBe(content)
    png.disabled = false
    await settled()
    expect(document.activeElement).toBe(png)
  })

  it("never takes focus back from where the person moved it meanwhile", async () => {
    const { name, png } = page()
    off = keepDialogFocus()
    png.focus()
    disableFocused(png)
    name.focus()
    png.disabled = false
    await settled()
    expect(document.activeElement).toBe(name)
  })

  // Excalidraw's content is a tab stop (tabindex 0), so the person's Shift+Tab can bring focus back onto it: focus
  // they moved is theirs from then on, even back on the dialog.
  it("never takes focus back once the person moved it, even onto the dialog again: Tab, then Shift+Tab", async () => {
    const { content, name, png } = page()
    off = keepDialogFocus()
    png.focus()
    disableFocused(png)
    expect(document.activeElement).toBe(content)
    name.focus()
    content.focus()
    png.disabled = false
    await settled()
    expect(document.activeElement).toBe(content)
  })

  it("never takes focus back after Tab past the disabled control and Shift+Tab twice onto the dialog", async () => {
    const { content, name, png, svg } = page()
    off = keepDialogFocus()
    png.focus()
    disableFocused(png)
    svg.focus()
    name.focus()
    content.focus()
    png.disabled = false
    await settled()
    expect(document.activeElement).toBe(content)
  })

  it("never takes focus back once it left the dialog for the page (a click on nothing focusable)", async () => {
    const { content, png } = page()
    off = keepDialogFocus()
    png.focus()
    disableFocused(png)
    content.blur()
    png.disabled = false
    await settled()
    expect(document.activeElement).toBe(document.body)
  })

  it("leaves alone focus moved on purpose, an enabled control's blur (the window losing focus) and a control outside a dialog", () => {
    const { board, content, png, svg } = page()
    // The dialog never takes focus on the way either: a browser can let a focus() heard during a focusout win over
    // the person's own move, where jsdom still ends on their choice, so the final focus alone can't tell.
    const taken = vi.fn()
    content.addEventListener("focus", taken)
    off = keepDialogFocus()
    png.focus()
    png.disabled = true
    svg.focus()
    expect(document.activeElement).toBe(svg)
    svg.blur()
    expect(document.activeElement).toBe(document.body)
    board.focus()
    disableFocused(board)
    expect(document.activeElement).toBe(document.body)
    expect(taken).not.toHaveBeenCalled()
  })

  it("gives nothing to a control that went away, and keeps nothing once uninstalled", async () => {
    const { content, png, svg } = page()
    off = keepDialogFocus()
    png.focus()
    disableFocused(png)
    png.remove()
    png.disabled = false
    await settled()
    expect(document.activeElement).toBe(content)
    off()
    off = () => {}
    svg.focus()
    disableFocused(svg)
    expect(document.activeElement).toBe(document.body)
  })
})

describe("useKeptDialogFocus", () => {
  it("keeps focus once per page while any board is mounted, and stops when the last one goes", () => {
    const listens = vi.spyOn(document, "addEventListener")
    const one = renderHook(() => useKeptDialogFocus())
    const two = renderHook(() => useKeptDialogFocus())
    expect(listens.mock.calls.filter(([type]) => type === "focusout")).toHaveLength(1)
    const { content, png, svg } = page()
    one.unmount()
    png.focus()
    disableFocused(png)
    expect(document.activeElement).toBe(content)
    two.unmount()
    svg.focus()
    disableFocused(svg)
    expect(document.activeElement).toBe(document.body)
  })
})
