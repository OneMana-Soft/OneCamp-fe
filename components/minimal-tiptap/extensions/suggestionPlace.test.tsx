import { afterEach, describe, expect, it, vi } from "vitest"
import { Editor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import type { Instance as TippyInstance } from "tippy.js"
import { SlashCommand } from "./slash-command/slashCommandExtension"
import "@/components/docEditor/registry"
import { slashItemsFor } from "@/components/docEditor/registry/readers"

// THE COMPOSER'S MENUS NEVER IN THE CORNER (20 Oct 2026). The slash and
// mention menus stand under the typed text, at the place Tiptap gives for its
// decoration. While the decoration is off the page Tiptap has none (null), and
// the menus fell back to a rect of zeros: the top-left corner. They stand by
// the editor's own box then (components/minimal-tiptap/extensions/suggestion-popup).

/**
 * Each ResizeObserver made while a test runs, with what it watches: jsdom lays
 * nothing out, so the test says when a size changed.
 */
class Watch implements ResizeObserver {
  static made: Watch[] = []
  watched: Element[] = []
  constructor(readonly changed: ResizeObserverCallback) {
    Watch.made.push(this)
  }
  observe(el: Element) {
    this.watched.push(el)
  }
  unobserve(el: Element) {
    this.watched = this.watched.filter((w) => w !== el)
  }
  disconnect() {
    this.watched = []
  }
}

const editors: Editor[] = []
afterEach(() => {
  cleanup()
  while (editors.length) editors.pop()?.destroy()
  document.body.innerHTML = ""
  vi.unstubAllGlobals()
  Watch.made = []
  Reflect.deleteProperty(document.documentElement, "clientWidth")
  Reflect.deleteProperty(document.documentElement, "clientHeight")
})

/** The menu's tippy: suggestion-popup makes it on the page's body. */
const menu = () => (document.body as HTMLElement & { _tippy?: TippyInstance })._tippy

describe("the slash menu's place", () => {
  it("stands by the editor, never at (0, 0), once the typed text has no place", async () => {
    const editor = new Editor({ extensions: [StarterKit, SlashCommand.configure({ commands: slashItemsFor("doc", { ai: false }) })], content: "<p></p>" })
    editors.push(editor)
    render(<EditorContent editor={editor} />)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    editor.view.dom.getBoundingClientRect = () => new DOMRect(120, 240, 640, 400)
    await act(async () => {
      editor.chain().focus("end").insertContent("/").run()
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(menu()).toBeTruthy()
    // The typed "/" leaves the page (a redraw), and Tiptap has no place for it.
    document.querySelectorAll("[data-decoration-id]").forEach((el) => el.removeAttribute("data-decoration-id"))
    const r = menu()!.props.getReferenceClientRect!()
    expect([r.left, r.top, r.width, r.height]).toEqual([120, 240, 640, 400])
  })
})

describe("the menus' flip", () => {
  it("stands above the typed text once its rows come and no longer fit below, with nothing typed", async () => {
    // Placed while empty, a list fits below the text. The "@" list's rows come
    // after it opens (its view loads then), and from 21 Oct 2026 it was never
    // placed again: it ran off the foot of the window instead of flipping.
    vi.stubGlobal("ResizeObserver", Watch)
    Object.defineProperties(document.documentElement, { clientWidth: { configurable: true, value: 1280 }, clientHeight: { configurable: true, value: 860 } })
    const editor = new Editor({ extensions: [StarterKit, SlashCommand.configure({ commands: slashItemsFor("doc", { ai: false }) })], content: "<p></p>" })
    editors.push(editor)
    render(<EditorContent editor={editor} />)
    await waitFor(() => expect(editor.view.dom.isConnected).toBe(true))
    act(() => {
      editor.chain().focus("end").insertContent("/").run()
    })
    await waitFor(() => expect(menu()?.state.isMounted).toBe(true))
    const popup = menu()!
    const placement = () => popup.popper.querySelector(".tippy-box")?.getAttribute("data-placement")
    await waitFor(() => expect(placement()).toBe("bottom-start"))
    // The typed "/" near the foot of the window, and the rows in: 320 px of list.
    document.querySelector("[data-decoration-id]")!.getBoundingClientRect = () => new DOMRect(120, 800, 8, 20)
    Object.defineProperties(popup.popper, { offsetWidth: { configurable: true, value: 320 }, offsetHeight: { configurable: true, value: 320 } })
    act(() => {
      for (const w of Watch.made) if (w.watched.some((el) => popup.popper.contains(el))) w.changed([], w)
    })
    await waitFor(() => expect(placement()).toBe("top-start"))
  })
})
