// Two tabs on one doc (or two people): each tab's editor, as the registry
// builds it, binds its own Y.Doc, and every update reaches the other tab as the
// provider's sync step hands it on. y-protocols catches what the receiving
// editor throws and only logs it, so a throw there leaves that tab's editor
// behind its Y.Doc, and y-prosemirror then writes the stale editor back over
// everyone's edits on that tab's next transaction.

import { afterEach, beforeAll, describe, expect, it } from "vitest"
import type * as Y from "yjs"
import { Editor, type JSONContent } from "@tiptap/core"
import { NodeSelection, TextSelection } from "@tiptap/pm/state"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import "@/components/docEditor/registry"
import { extensionsFor, loadBlocks } from "@/components/docEditor/registry/factory"
import { ALL_EDITIONS, bareContext } from "@/components/docEditor/registry/manifest"
import { offlineProvider, twoTabDocs } from "@/components/docEditor/docTestKit"
import { outline, posOf } from "@/components/minimal-tiptap/extensions/block-commands/blockTestKit"

const DOC = "doc-two-tabs"

const open: { editor: Editor; provider: HocuspocusProvider }[] = []
beforeAll(() => loadBlocks("doc", ALL_EDITIONS))
afterEach(() => {
  for (const t of open.splice(0)) {
    t.editor.destroy()
    t.provider.destroy()
  }
})

function tab(doc: Y.Doc, who: string): Editor {
  const provider = offlineProvider(doc, DOC)
  const editor = new Editor({
    extensions: extensionsFor({
      ...bareContext("doc", ALL_EDITIONS),
      docId: DOC,
      collaboration: { enabled: true, documentId: DOC, username: who, userId: `u-${who}` },
      provider,
    }),
  })
  open.push({ editor, provider })
  return editor
}

/** Sam's and Priya's tabs, with what Priya's editor threw while taking Sam's updates. */
function twoTabs(content: JSONContent[]) {
  const { docs, thrown } = twoTabDocs()
  const sam = tab(docs[0], "sam")
  const priya = tab(docs[1], "priya")
  sam.commands.setContent({ type: "doc", content })
  return { sam, priya, thrown }
}

const p = (text: string): JSONContent => ({ type: "paragraph", content: [{ type: "text", text }] })
const PAGE: JSONContent = { type: "subpage", attrs: { docId: "c7a30000-0000-4000-8000-000000000002" } }
const DIVIDER: JSONContent = { type: "horizontalRule" }

/** Priya clicks the block: a node selection on it. */
function select(editor: Editor, type: string) {
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, posOf(editor.state.doc, "", type))))
}

function remove(editor: Editor, type: string) {
  const from = posOf(editor.state.doc, "", type)
  editor.view.dispatch(editor.state.tr.delete(from, from + editor.state.doc.nodeAt(from)!.nodeSize))
}

/** Types at the end of the block that reads `text`. */
function typeAfter(editor: Editor, text: string, typed: string) {
  editor.view.dispatch(editor.state.tr.insertText(typed, posOf(editor.state.doc, text) + 1 + text.length))
}

describe("two tabs on one doc", () => {
  it.each([
    ["a page block", PAGE, "subpage"],
    ["a divider", DIVIDER, "horizontalRule"],
  ])("%s the other tab has selected, deleted as the doc's last block, stays deleted, and that tab misses no edit", (_kind, block, type) => {
    const { sam, priya, thrown } = twoTabs([p("Launch plan"), block])
    select(priya, type)

    remove(sam, type)
    typeAfter(sam, "Launch plan", " and dates")
    // Priya's tab moves on: her caret, as any later transaction there does.
    priya.view.dispatch(priya.state.tr.setSelection(TextSelection.create(priya.state.doc, 1)))

    expect(outline(sam.state.doc)).toEqual(["paragraph:Launch plan and dates"])
    expect(outline(priya.state.doc)).toEqual(["paragraph:Launch plan and dates"])
    expect(thrown).toEqual([])
  })

  it("a page block that took the doc's only line, deleted, stays deleted in the tab that only watched", () => {
    const { sam, priya, thrown } = twoTabs([p("Launch plan")])
    priya.view.dispatch(priya.state.tr.setSelection(TextSelection.create(priya.state.doc, 3)))

    sam.view.dispatch(sam.state.tr.replaceWith(0, sam.state.doc.content.size, sam.state.schema.nodeFromJSON(PAGE)))
    // No text is left for her caret: the tab that only watched now holds the block.
    expect(priya.state.selection).toBeInstanceOf(NodeSelection)
    remove(sam, "subpage")
    sam.view.dispatch(sam.state.tr.insertText("Launch notes", 1))
    priya.view.dispatch(priya.state.tr.setSelection(TextSelection.create(priya.state.doc, 1)))

    expect(outline(sam.state.doc)).toEqual(["paragraph:Launch notes"])
    expect(outline(priya.state.doc)).toEqual(["paragraph:Launch notes"])
    expect(thrown).toEqual([])
  })

  // Where the caret lands: the nearest text, never on a block beside the one
  // that went (a second Delete, Priya's own, would take that block instead).
  it.each([
    ["mid-doc, text after it", [p("Launch plan"), PAGE, p("Dates")], ["paragraph:Launch plan", "paragraph:Dates"], "Dates", 0],
    ["mid-doc, a divider after it", [p("Launch plan"), PAGE, DIVIDER, p("Dates")], ["paragraph:Launch plan", "horizontalRule:", "paragraph:Dates"], "Dates", 0],
    ["last, a divider before it", [p("Launch plan"), DIVIDER, PAGE], ["paragraph:Launch plan", "horizontalRule:"], "Launch plan", "Launch plan".length],
  ])("a selected block deleted %s leaves the other tab's caret in the nearest text", (_where, content, left, text, offset) => {
    const { sam, priya, thrown } = twoTabs(content)
    select(priya, "subpage")

    remove(sam, "subpage")

    expect(thrown).toEqual([])
    expect(outline(priya.state.doc)).toEqual(left)
    expect(priya.state.selection).toBeInstanceOf(TextSelection)
    expect(priya.state.selection.from).toBe(posOf(priya.state.doc, text) + 1 + offset)
  })

  it("a selected block someone else edits around stays selected", () => {
    const { sam, priya } = twoTabs([p("Launch plan"), PAGE])
    select(priya, "subpage")

    typeAfter(sam, "Launch plan", " and dates")
    sam.commands.insertContentAt(sam.state.doc.content.size, p("Dates"))

    expect(outline(priya.state.doc)).toEqual(["paragraph:Launch plan and dates", "subpage:", "paragraph:Dates"])
    const selection = priya.state.selection
    expect(selection).toBeInstanceOf(NodeSelection)
    expect((selection as NodeSelection).node.type.name).toBe("subpage")
  })
})
