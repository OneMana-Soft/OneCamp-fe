import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { Editor } from "@tiptap/core"

import "@/components/docEditor/registry"
import "@/components/minimal-tiptap/extensions/formatting/register"
import { extensionsFor, loadBlocks } from "@/components/docEditor/registry/factory"
import { ALL_EDITIONS, bareContext } from "@/components/docEditor/registry/manifest"
import { slashItemsFor } from "@/components/docEditor/registry/readers"
import { isToggleOpen, resetToggleStates } from "../collapsible/toggleState"
import { HEADINGS_SETTLE_MS, docHeadings, headingsOf, onDocHeadings } from "./headings"

// The table of contents and the headings it lists (B2; editor.md P1-11,
// small-details V30): kept current a moment after the doc changes, never per
// key, and a click takes the reader to a heading, opening what folds it.

beforeAll(() => loadBlocks("doc", ALL_EDITIONS), 30_000)

const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()!.destroy()
  resetToggleStates()
  vi.useRealTimers()
})

function docEditor(content: string | object) {
  const editor = new Editor({ extensions: extensionsFor(bareContext("doc")), content })
  editors.push(editor)
  return editor
}

describe("a doc's headings", () => {
  it("are its H1 to H3, in order, inside toggles and callouts too", () => {
    const editor = docEditor(
      '<h1>Plan</h1><p>x</p><h2>Scope</h2><h4>Small print</h4><div data-type="collapsible"><h3>Folded</h3><p>body</p></div><div data-type="callout"><h2>In a callout</h2></div>',
    )
    expect(headingsOf(editor.state.doc).map((h) => [h.level, h.text])).toEqual([
      [1, "Plan"],
      [2, "Scope"],
      [3, "Folded"],
      [2, "In a callout"],
    ])
  })

  it("are read again only once the typing has stopped", () => {
    vi.useFakeTimers()
    const editor = docEditor("<h1>One</h1>")
    const heard = vi.fn()
    const stop = onDocHeadings(editor, heard)
    editor.commands.insertContentAt(editor.state.doc.content.size, "<h2>Two</h2>")
    editor.commands.insertContentAt(editor.state.doc.content.size, "<h2>Three</h2>")
    expect(heard).not.toHaveBeenCalled()
    vi.advanceTimersByTime(HEADINGS_SETTLE_MS)
    expect(heard).toHaveBeenCalledTimes(1)
    expect(docHeadings(editor).map((h) => h.text)).toEqual(["One", "Two", "Three"])
    stop()
  })

  it("are read again after content set whole, which sends no update event", () => {
    vi.useFakeTimers()
    const editor = docEditor("<p>Nothing yet</p>")
    const heard = vi.fn()
    const stop = onDocHeadings(editor, heard)
    editor.commands.setContent("<h1>Plan</h1><h2>Goals</h2>", false)
    vi.advanceTimersByTime(HEADINGS_SETTLE_MS)
    expect(heard).toHaveBeenCalledTimes(1)
    expect(docHeadings(editor).map((h) => h.text)).toEqual(["Plan", "Goals"])
    // A selection that moves changes nothing.
    editor.commands.setTextSelection(2)
    vi.advanceTimersByTime(HEADINGS_SETTLE_MS)
    expect(heard).toHaveBeenCalledTimes(1)
    stop()
  })
})

describe("the table of contents", () => {
  it('comes from "/toc" and lists the headings as links', () => {
    const editor = docEditor("<h1>Plan</h1><h2>Scope</h2><p></p>")
    const toc = slashItemsFor("doc", ALL_EDITIONS).find((i) => i.id === "toc")!
    expect(toc.title).toBe("Table of contents")
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    toc.command({ editor: editor as never, range: { from: editor.state.selection.from, to: editor.state.selection.from } })
    expect(editor.getHTML()).toContain('<div data-type="toc"')
    const links = editor.view.dom.querySelectorAll("nav.doc-toc a.doc-toc-item")
    expect(Array.from(links, (a) => [a.getAttribute("data-level"), a.textContent])).toEqual([
      ["1", "Plan"],
      ["2", "Scope"],
    ])
  })

  it("says what it is for while the doc has no headings", () => {
    const editor = docEditor('<div data-type="toc"></div><p>text</p>')
    expect(editor.view.dom.querySelector(".doc-toc-empty")?.textContent).toBe("The headings you add show here.")
  })

  it("takes the reader to a heading, opening the toggle it is folded in", () => {
    const editor = docEditor({
      type: "doc",
      content: [
        { type: "toc" },
        { type: "collapsible", attrs: { blockId: "fold" }, content: [{ type: "paragraph", content: [{ type: "text", text: "Details" }] }, { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Hidden heading" }] }] },
      ],
    })
    const scrolled = vi.fn()
    Element.prototype.scrollIntoView = scrolled
    const link = editor.view.dom.querySelector<HTMLAnchorElement>("a.doc-toc-item")!
    expect(link.textContent).toBe("Hidden heading")
    expect(isToggleOpen("fold")).toBe(false)
    link.click()
    expect(isToggleOpen("fold")).toBe(true)
    expect(scrolled).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }))
  })
})
