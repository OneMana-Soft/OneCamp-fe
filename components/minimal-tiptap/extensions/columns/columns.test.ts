import { beforeAll, describe, expect, it } from "vitest"
import { parseWidth, percentWidths, setRowWidths } from "./columns"
import { docEditor, loadDocBlocks, outline } from "../block-commands/blockTestKit"

beforeAll(loadDocBlocks, 60_000)

// Columns (editor.md P1-14): 2–4 a row, widths as whole percents of the row,
// and a row left with one column gives its blocks back.

describe("columns", () => {
  it('come from "/": the empty line a "/" left becomes a row, the caret in its first column', () => {
    const e = docEditor("<p>above</p><p></p>")
    e.commands.insertColumns(3)
    expect(outline(e.state.doc)).toEqual(["paragraph:above", "columnList:"])
    expect(e.state.doc.lastChild!.childCount).toBe(3)
    expect(e.state.selection.$from.node(-1).type.name).toBe("column")
    expect(e.state.selection.$from.index(-2)).toBe(0)
  })

  it("are two to four", () => {
    const e = docEditor("<p></p>")
    e.commands.insertColumns(9)
    expect(e.state.doc.firstChild!.childCount).toBe(4)
  })

  it("write and read their widths as whole percents", () => {
    const e = docEditor('<div data-type="column-list"><div data-type="column" data-width="40"><p>a</p></div><div data-type="column" data-width="60"><p>b</p></div></div>')
    const row = e.state.doc.firstChild!
    expect([row.child(0).attrs.width, row.child(1).attrs.width]).toEqual([40, 60])
    expect(e.getHTML()).toContain('data-width="40"')
    expect([parseWidth("33"), parseWidth(" 7 "), parseWidth("0"), parseWidth("100"), parseWidth("2.5"), parseWidth(null)]).toEqual([33, 7, null, null, null, null])
  })

  it("share a row as they were drawn: whole percents that sum to 100, none under a tenth", () => {
    expect(percentWidths([100, 300])).toEqual([25, 75])
    expect(percentWidths([1, 1000])).toEqual([10, 90])
    expect(percentWidths([1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100)
  })

  it("are set for a whole row at once, or made even again", () => {
    const e = docEditor('<div data-type="column-list"><div data-type="column"><p>a</p></div><div data-type="column"><p>b</p></div></div>')
    e.view.dispatch(setRowWidths(e.state.tr, 0, [30, 70]))
    expect([e.state.doc.firstChild!.child(0).attrs.width, e.state.doc.firstChild!.child(1).attrs.width]).toEqual([30, 70])
    e.view.dispatch(setRowWidths(e.state.tr, 0, []))
    expect(e.state.doc.firstChild!.child(1).attrs.width).toBeNull()
  })

  it("stand one above the other below 768 px, by the pane's width", async () => {
    const { readFileSync } = await import("node:fs")
    const css = readFileSync("components/minimal-tiptap/styles/index.css", "utf8")
    expect(css).toMatch(/@container \(max-width: 767px\) \{\s*\.doc-editor \.ProseMirror \[data-type="column-list"\] \{\s*flex-direction: column;/)
  })

  it("draw each column as plain DOM, with a grip outside the text", () => {
    const e = docEditor('<div data-type="column-list"><div data-type="column" data-width="40"><p>a</p></div><div data-type="column"><p>b</p></div></div>')
    const col = e.view.dom.querySelector<HTMLElement>('[data-type="column"]')!
    expect(col.style.flexGrow).toBe("40")
    expect(col.querySelector(".doc-column-body > p")?.textContent).toBe("a")
    expect(col.querySelector(".doc-column-grip")?.getAttribute("contenteditable")).toBe("false")
  })

  it("widen from the keyboard: the grip is a separator, ← and → move a twentieth", () => {
    const e = docEditor('<div data-type="column-list"><div data-type="column"><p>a</p></div><div data-type="column"><p>b</p></div></div>')
    const grip = e.view.dom.querySelector<HTMLElement>(".doc-column-grip")!
    expect([grip.tabIndex, grip.getAttribute("role"), grip.getAttribute("aria-orientation")]).toEqual([0, "separator", "vertical"])
    grip.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }))
    const row = e.state.doc.firstChild!
    expect([row.child(0).attrs.width, row.child(1).attrs.width]).toEqual([55, 45])
    const now = e.view.dom.querySelector(".doc-column-grip")!
    expect(now.getAttribute("aria-valuenow")).toBe("55")
  })

  it("never lose what a collaborator's change leaves in a row of one", () => {
    const e = docEditor('<div data-type="column-list"><div data-type="column"><p>only</p></div></div>')
    // The schema holds a row of one (column+): read as it came, nothing dropped.
    expect(e.state.doc.firstChild!.type.name).toBe("columnList")
    expect(e.state.doc.textContent).toBe("only")
  })
})
