import { afterEach, describe, expect, it } from "vitest"
import { Editor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { act, cleanup, render } from "@testing-library/react"
import type { Instance as TippyInstance } from "tippy.js"
import { SlashCommand } from "./slash-command/slashCommandExtension"
import "@/components/docEditor/registry"
import { slashItemsFor } from "@/components/docEditor/registry/readers"

// THE COMPOSER'S MENUS NEVER IN THE CORNER (20 Oct 2026). The slash and
// mention menus stand under the typed text, at the place Tiptap gives for its
// decoration. While the decoration is off the page Tiptap has none (null), and
// the menus fell back to a rect of zeros: the top-left corner. They stand by
// the editor's own box then (components/minimal-tiptap/extensions/suggestion-popup).

const editors: Editor[] = []
afterEach(() => {
  cleanup()
  while (editors.length) editors.pop()?.destroy()
  document.body.innerHTML = ""
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
