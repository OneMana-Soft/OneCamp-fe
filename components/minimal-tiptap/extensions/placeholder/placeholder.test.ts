import { afterEach, describe, expect, it, vi } from "vitest"
import { Editor } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"
import { Placeholder } from "@tiptap/extension-placeholder"
import { TextSelection } from "@tiptap/pm/state"
import { DocPlaceholder, isEmptyDoc } from "./placeholder"
import { docPlaceholderText } from "./placeholderSpec"
import { blocksFor } from "@/components/docEditor/registry/registry"

const editors: Editor[] = []
afterEach(() => {
  editors.splice(0).forEach((e) => e.destroy())
  vi.restoreAllMocks()
})

function make(content: string, placeholder: unknown = DocPlaceholder.configure({ placeholder: docPlaceholderText })) {
  const editor = new Editor({ extensions: [StarterKit.configure({ history: false }), placeholder as never], content })
  editors.push(editor)
  return editor
}
const shown = (editor: Editor) =>
  [...editor.view.dom.querySelectorAll("[data-placeholder]")].map((el) => ({ tag: el.tagName.toLowerCase(), text: el.getAttribute("data-placeholder"), cls: el.className }))
const caretAt = (editor: Editor, pos: number) => editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)))
const big = (n: number) => Array.from({ length: n }, (_, i) => `<p>Block ${i} says something</p>`).join("")

describe("the doc placeholder", () => {
  it("says what to do in an empty doc, as the empty editor", () => {
    const editor = make("<p></p>")
    expect(shown(editor)).toEqual([{ tag: "p", text: "Type / for blocks, @ for people", cls: "is-empty is-editor-empty" }])
    expect(isEmptyDoc(editor.state.doc)).toBe(true)
  })

  it("marks only the empty block the caret is in", () => {
    const editor = make("<p>One</p><h2></h2><p>Three</p><p></p>")
    caretAt(editor, 6) // inside the empty heading
    expect(shown(editor)).toEqual([{ tag: "h2", text: "Heading 2", cls: "is-empty" }])
    caretAt(editor, 2) // inside "One"
    expect(shown(editor)).toEqual([])
  })

  it("marks nested blocks too when asked (A0's list items and to-dos)", () => {
    const editor = make("<ul><li><p></p></li></ul>", DocPlaceholder.configure({ placeholder: ({ node }) => node.type.name, includeChildren: true }))
    caretAt(editor, 3)
    expect(shown(editor).map((s) => s.text)).toEqual(["bulletList", "listItem", "paragraph"])
  })

  it("shows nothing while the doc can't be edited", () => {
    const editor = make("<p></p>")
    editor.setEditable(false)
    expect(shown(editor)).toEqual([])
  })

  // I20: no walk of the whole doc per key. Tiptap's walks it on every
  // transaction (perf §1.8: 1.6 ms of every key on 2,000 blocks).
  it("never walks the doc: its work is the caret's depth, whatever the doc's size", () => {
    const tiptap = make(`${big(2000)}<p></p>`, Placeholder.configure({ placeholder: "x" }))
    const ours = make(`${big(2000)}<p></p>`)
    const proto = Object.getPrototypeOf(ours.state.doc)
    const descendants = vi.spyOn(proto, "descendants")
    const nodesBetween = vi.spyOn(proto, "nodesBetween")

    caretAt(tiptap, tiptap.state.doc.content.size - 1)
    expect(descendants.mock.calls.length + nodesBetween.mock.calls.length).toBeGreaterThan(0) // the probe sees a walk
    descendants.mockClear()
    nodesBetween.mockClear()

    const end = ours.state.doc.content.size - 1
    caretAt(ours, end)
    for (let i = 0; i < 20; i++) ours.view.dispatch(ours.state.tr.insertText("a", ours.state.selection.from))
    expect(descendants).not.toHaveBeenCalled()
    expect(nodesBetween).not.toHaveBeenCalled()
    // (ProseMirror's own DecorationSet.create and view update pass over the
    // top-level children once per update whatever the plugins do; that is the
    // view's cost, not a walk this plugin adds.)
  })

  it("registers for the doc editor and the guest viewer, writing nothing", () => {
    const before = blocksFor("doc", { ai: false }).length
    return import("./placeholderSpec").then(() => {
      const spec = blocksFor("doc", { ai: false }).find((b) => b.id === "placeholder")
      expect(spec?.schema).toEqual([])
      expect(spec?.editors).toEqual(["doc", "guest"])
      expect(spec?.extensions?.[0]?.name).toBe("placeholder")
      expect(blocksFor("doc", { ai: false }).length).toBeGreaterThanOrEqual(before)
    })
  })
})
