import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { Editor, Extension } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { DocAiMarkers, SPACE_HINT, docAiKey, pinRange, pinnedRange, seenSelection, unpin } from "./docAiPlugin"
import { aiBarOf, closeAiBar, handToPanel, openAiBar, subscribeAiBar, takePanelHandoff } from "./docAiStore"
import "@/components/docEditor/registry"
import { extensionsFor, loadBlocks } from "@/components/docEditor/registry/factory"
import { bareContext } from "@/components/docEditor/registry/manifest"

// The bar's keys (ai-search-io §2.1, editor.md P2-1, small-details T35 and
// U19): space on an empty line, ⌘J and ⇧⌘J, and nowhere they would take a
// key someone meant to type.

// A "/" menu, open or not, as the suggestion plugins keep it.
const menu = { open: false }
const SlashMenu = Extension.create({
  name: "testSlashMenu",
  addProseMirrorPlugins: () => [new Plugin({ key: new PluginKey("testSlash"), state: { init: () => ({ active: false }), apply: () => ({ active: menu.open }) } })],
})

let editor: Editor
beforeEach(() => {
  menu.open = false
  editor = new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit, SlashMenu, DocAiMarkers.configure({ docId: "d1" })],
    content: "<p>Intro.</p><p></p><ul><li><p></p></li></ul>",
  })
})
afterEach(() => editor.destroy())

/** A key pressed in the text, as the browser sends it; true when the editor took it. */
function press(key: string, mods: { ctrlKey?: boolean; shiftKey?: boolean; metaKey?: boolean } = {}): boolean {
  const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods })
  editor.view.dom.dispatchEvent(e)
  return e.defaultPrevented
}

const emptyLine = () => editor.state.doc.child(0).nodeSize + 1
const inList = () => editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize + 3

describe("space on an empty line", () => {
  it("opens the bar there, and the space isn't typed", () => {
    editor.commands.setTextSelection(emptyLine())
    expect(press(" ")).toBe(true)
    expect(aiBarOf(editor)).toMatchObject({ open: true, request: { docId: "d1", from: emptyLine(), to: emptyLine(), mode: "actions", source: "space" } })
  })

  it("types a space the second time, as Notion's does", () => {
    editor.commands.setTextSelection(emptyLine())
    press(" ")
    // Esc in the bar closes it, resting on that line.
    closeAiBar(editor, emptyLine() - 1)
    expect(press(" ")).toBe(false)
    // And the next one opens it again: the rest is used up.
    expect(press(" ")).toBe(true)
  })

  it("types a space in a line with words, in a list, while a menu is open, or in a doc that can't be edited", () => {
    editor.commands.setTextSelection(3)
    expect(press(" ")).toBe(false)
    editor.commands.setTextSelection(inList())
    expect(press(" ")).toBe(false)
    editor.commands.setTextSelection(emptyLine())
    menu.open = true
    editor.view.dispatch(editor.state.tr)
    expect(press(" ")).toBe(false)
    menu.open = false
    editor.view.dispatch(editor.state.tr)
    editor.setEditable(false)
    expect(press(" ")).toBe(false)
    expect(aiBarOf(editor).open).toBe(false)
  })
})

describe("the empty line's hint", () => {
  const hinted = () => Array.from(editor.view.dom.querySelectorAll("[data-placeholder]")).map((p) => p.getAttribute("data-placeholder"))

  it("says space opens AI, on the empty line the caret is on", () => {
    editor.commands.setTextSelection(emptyLine())
    expect(hinted()).toEqual([SPACE_HINT])
    editor.commands.setTextSelection(3)
    expect(hinted()).toEqual([])
    editor.commands.setTextSelection(inList())
    expect(hinted()).toEqual([])
  })

  it("isn't shown where nothing can be written", () => {
    editor.commands.setTextSelection(emptyLine())
    editor.setEditable(false)
    expect(hinted()).toEqual([])
  })
})

describe("⌘J and ⇧⌘J", () => {
  it("open the bar on the selection, or ready for a question about the doc", () => {
    editor.commands.setTextSelection({ from: 1, to: 6 })
    expect(press("j", { ctrlKey: true })).toBe(true)
    expect(aiBarOf(editor).request).toMatchObject({ from: 1, to: 6, mode: "actions", source: "keys" })
    expect(press("J", { ctrlKey: true, shiftKey: true })).toBe(true)
    expect(aiBarOf(editor).request).toMatchObject({ mode: "ask", source: "keys" })
  })

  it("take the selection the person sees, before the editor has read it", () => {
    editor.commands.setTextSelection(1)
    document.body.appendChild(editor.view.dom)
    // ⇧End, then ⌘J at once: the browser holds the text the editor hasn't read yet.
    const text = editor.view.dom.querySelector("p")!.firstChild!
    document.getSelection()!.setBaseAndExtent(text, 0, text, 5)
    expect(editor.state.selection.empty).toBe(true)
    expect(seenSelection(editor.view)).toEqual({ from: 1, to: 6 })
    document.getSelection()!.removeAllRanges()
    expect(seenSelection(editor.view)).toEqual({ from: 1, to: 1 })
    editor.view.dom.remove()
  })

  it("leave the key alone in a doc that can't be edited", () => {
    editor.setEditable(false)
    expect(press("j", { ctrlKey: true })).toBe(false)
  })
})

describe("the bar's store", () => {
  it("opens afresh each time it is asked, and tells who listens", () => {
    let heard = 0
    const off = subscribeAiBar(editor, () => heard++)
    const req = { docId: "d1", from: 1, to: 1, mode: "actions" as const, source: "action" as const }
    openAiBar(editor, req)
    const first = aiBarOf(editor).seq
    openAiBar(editor, req)
    expect(aiBarOf(editor).seq).toBe(first + 1)
    closeAiBar(editor)
    expect(aiBarOf(editor)).toMatchObject({ open: false, request: req })
    off()
    openAiBar(editor, req)
    expect(heard).toBe(3)
  })

  it("hands the panel the bar's answer once", () => {
    handToPanel(editor, { action: "explain", text: "It means this week." })
    expect(takePanelHandoff(editor)).toEqual({ action: "explain", text: "It means this week." })
    expect(takePanelHandoff(editor)).toBeUndefined()
  })
})

describe("a pinned place", () => {
  it("follows the text through edits before it, and is gone once let go", () => {
    const pin = pinRange(editor, 1, 6)
    editor.commands.insertContentAt(0, "<p>Added above.</p>")
    const moved = pinnedRange(editor, pin)!
    expect(editor.state.doc.textBetween(moved.from, moved.to)).toBe("Intro")
    unpin(editor, pin)
    expect(pinnedRange(editor, pin)).toBeNull()
    expect(docAiKey.getState(editor.state)?.size).toBe(0)
  })

  it("is not part of the doc's undo", () => {
    editor.commands.insertContent("x")
    pinRange(editor, 1, 2)
    editor.commands.undo()
    expect(editor.state.doc.textContent).not.toContain("x")
  })
})

// Docs follow-up (15 Oct 2026): the keys and pins are the doc page editor's
// own from when it is made (the registry's "ai.markers"), never added once
// it is open, as the overlay once did.
describe("on the doc page's editor", () => {
  beforeAll(async () => {
    await loadBlocks("doc", { ai: true })
    await loadBlocks("doc", { ai: false })
  }, 30_000)

  it("are there from the start, and the empty line reads their hint over the doc's own placeholder", () => {
    const doc = new Editor({
      element: document.body.appendChild(document.createElement("div")),
      extensions: extensionsFor({ ...bareContext("doc", { ai: true }), docId: "d1" }),
      content: "<p>Intro.</p><p></p>",
    })
    try {
      expect(docAiKey.getState(doc.state)).toBeDefined()
      doc.commands.setTextSelection(doc.state.doc.child(0).nodeSize + 1)
      const hint = doc.view.dom.querySelector("p:last-child")?.getAttribute("data-placeholder")
      expect(hint).toBe(SPACE_HINT)
    } finally {
      doc.destroy()
    }
  })

  it("are not in an editor of no doc, nor where AI is off", () => {
    const named = (ctx: Parameters<typeof extensionsFor>[0]) => extensionsFor(ctx).map((e) => e.name)
    expect(named({ ...bareContext("doc", { ai: true }), docId: "d1" })).toContain("docAiMarkers")
    expect(named(bareContext("doc", { ai: true }))).not.toContain("docAiMarkers")
    expect(named({ ...bareContext("doc", { ai: false }), docId: "d1" })).not.toContain("docAiMarkers")
  })
})
