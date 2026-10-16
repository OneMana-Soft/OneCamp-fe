import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"

import "@/components/docEditor/registry"
import "@/components/minimal-tiptap/extensions/formatting/register"
import { actionById } from "@/components/docEditor/registry/registry"
import { extensionsFor, loadBlocks } from "@/components/docEditor/registry/factory"
import { ALL_EDITIONS, bareContext } from "@/components/docEditor/registry/manifest"
import { createDocCommandBus } from "@/components/docEditor/registry/commandBus"
import { listFormatOf, orderedListAround } from "./listFormat"
import { quoteAround } from "../quote-size/quoteSize"

// Lettered and roman lists, and the large quote (B2; small-details K5, V14;
// editor.md P2-8): typed, picked in the block menu, stored on the block.

beforeAll(() => loadBlocks("doc", ALL_EDITIONS), 30_000)

const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()!.destroy()
})

function docEditor(content: string) {
  const editor = new Editor({ extensions: extensionsFor(bareContext("doc")), content })
  editors.push(editor)
  return editor
}

function type(editor: Editor, text: string) {
  for (const ch of text) {
    const { from, to } = editor.state.selection
    const insert = () => editor.state.tr.insertText(ch, from, to)
    const handled = editor.view.someProp("handleTextInput", (f) => f(editor.view, from, to, ch, insert))
    if (!handled) editor.view.dispatch(insert())
  }
}

const caretIn = (editor: Editor, text: string) => {
  let at = -1
  editor.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text!.includes(text)) at = pos + node.text!.indexOf(text) + 1
  })
  editor.commands.setTextSelection(at)
}

const html = (editor: Editor) => editor.getHTML().replace(/ data-block-id="[^"]*"/g, "")

const ctx = (editor: Editor, state: Record<string, unknown> = {}) => ({ docId: "d", editor, canEdit: true, bus: createDocCommandBus("d"), state })

describe("lettered and roman lists", () => {
  it('start with "a." or "i." and a space, as a numbered list starts with "1."', () => {
    for (const [typed, format] of [["a. ", "a"], ["i. ", "i"]] as const) {
      const editor = docEditor("<p></p>")
      editor.commands.setTextSelection(1)
      type(editor, `${typed}first`)
      expect(html(editor), typed).toContain(`<ol class="list-node" type="${format}">`)
      expect(editor.state.doc.textContent).toBe("first")
    }
  })

  it("count by depth when they have no format of their own: 1, then a, then i", () => {
    const editor = docEditor("<ol><li><p>one</p><ol><li><p>two</p><ol><li><p>three</p></li></ol></li></ol></li></ol>")
    const formatAt = (text: string) => {
      caretIn(editor, text)
      return listFormatOf(orderedListAround(editor.state.selection.$from)!)
    }
    expect(["one", "two", "three"].map(formatAt)).toEqual(["1", "a", "i"])
  })

  it("take a format from the block menu, shown checked, only on a numbered list", () => {
    const editor = docEditor("<ol><li><p>one</p></li></ol><p>plain</p>")
    caretIn(editor, "one")
    const letters = actionById("listFormat.a", { ai: false })!
    const numbers = actionById("listFormat.1", { ai: false })!
    expect(letters.surfaces).toEqual(["blockMenu"])
    expect([numbers.isChecked!(ctx(editor)), letters.isChecked!(ctx(editor))]).toEqual([true, false])
    letters.run(ctx(editor, { range: { from: 0, to: editor.state.doc.child(0).nodeSize } }))
    expect(html(editor)).toContain('<ol class="list-node" type="a">')
    expect(letters.isChecked!(ctx(editor))).toBe(true)
    caretIn(editor, "plain")
    expect(letters.isVisible!(ctx(editor))).toBe(false)
  })
})

describe("the large quote", () => {
  it("is set and taken off from the block menu, and only on a quote", () => {
    const editor = docEditor("<blockquote><p>Ship it.</p></blockquote><p>after</p>")
    caretIn(editor, "Ship")
    const large = actionById("quote.large", { ai: false })!
    expect(large.isVisible!(ctx(editor))).toBe(true)
    large.run(ctx(editor))
    expect(html(editor)).toContain('<blockquote class="block-node" data-quote-size="large">')
    expect(large.isChecked!(ctx(editor))).toBe(true)
    large.run(ctx(editor))
    expect(html(editor)).not.toContain("data-quote-size")
    caretIn(editor, "after")
    expect(large.isVisible!(ctx(editor))).toBe(false)
    expect(quoteAround(editor.state)).toBeNull()
  })

  it("reads back from the saved HTML", () => {
    const editor = docEditor('<blockquote data-quote-size="large"><p>Big.</p></blockquote><blockquote data-quote-size="huge"><p>Not ours.</p></blockquote>')
    expect([0, 1].map((i) => editor.state.doc.child(i).attrs.quoteSize)).toEqual(["large", null])
  })
})
