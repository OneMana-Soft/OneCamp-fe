import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { installRangeRects } from "@/lib/testing/rangeRects"
import { Editor, type JSONContent } from "@tiptap/core"
import "@/components/docEditor/registry"
import { extensionsFor, loadBlocks } from "@/components/docEditor/registry/factory"
import { ALL_EDITIONS, bareContext } from "@/components/docEditor/registry/manifest"
import { insertSimpleTable } from "./simpleTable"
import { parseCsv, parseDelimited } from "./tablePaste"

// The simple table (docs programme B3, editor.md P1-3): "/simple table" gives
// 3×3 with a header row, Tab moves between cells (and the last one adds a
// row), a pasted 3×4 TSV is a table, cells keep their colour and widths, and
// another person's change is never "repaired" by this tab (I6).

beforeAll(() => loadBlocks("doc", ALL_EDITIONS), 30_000)
let restoreRects = () => {}
beforeAll(() => {
  // jsdom lays nothing out: ProseMirror measures ranges as it scrolls the caret into view.
  restoreRects = installRangeRects()
})
afterAll(() => restoreRects())

/** Pastes text with no HTML, as a terminal or a TSV file gives it; ⇧ held, as a plain paste. */
function paste(editor: Editor, text: string, shift = false) {
  if (shift) editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", keyCode: 16, shiftKey: true, bubbles: true }))
  const event = new Event("paste", { bubbles: true, cancelable: true })
  Object.defineProperty(event, "clipboardData", { value: { getData: (t: string) => (t === "text/plain" ? text : ""), types: ["text/plain"], files: [], items: [] } })
  editor.view.dom.dispatchEvent(event)
}

const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()!.destroy()
  document.body.innerHTML = ""
})

function docEditor(content: string | JSONContent = "<p></p>") {
  const el = document.body.appendChild(document.createElement("div"))
  const editor = new Editor({ element: el, extensions: extensionsFor(bareContext("doc")), content })
  editors.push(editor)
  editor.commands.focus("end")
  return editor
}

const KEY_CODES: Record<string, number> = { Tab: 9, Backspace: 8 }

/** A key as the browser sends it. */
function press(editor: Editor, combo: string) {
  const parts = combo.split(/-(?!$)/)
  const key = parts.pop()!
  const event = new KeyboardEvent("keydown", { key, keyCode: KEY_CODES[key] ?? key.charCodeAt(0), shiftKey: parts.includes("Shift"), bubbles: true, cancelable: true })
  editor.view.dom.dispatchEvent(event)
  return event
}

const table = (e: Editor) => e.getJSON().content?.find((n) => n.type === "table")
const shape = (t: JSONContent | undefined) => (t?.content ?? []).map((r) => (r.content ?? []).map((c) => c.type))
/** The text of the cell the caret is in. */
const caretCell = (e: Editor) => {
  const { $from } = e.state.selection
  for (let d = $from.depth; d > 0; d--) if (/^table(Cell|Header)$/.test($from.node(d).type.name)) return $from.node(d).textContent
  return null
}

describe("/simple table", () => {
  it("gives 3×3, its first row a header, the caret in the first cell", () => {
    const e = docEditor()
    insertSimpleTable(e, { from: 1, to: 1 })
    expect(shape(table(e))).toEqual([
      ["tableHeader", "tableHeader", "tableHeader"],
      ["tableCell", "tableCell", "tableCell"],
      ["tableCell", "tableCell", "tableCell"],
    ])
    expect(caretCell(e)).toBe("")
    expect(e.state.selection.$from.node(-1).type.name).toBe("tableHeader")
  })
})

describe("Tab in a table", () => {
  const grid = '<table><tbody><tr><th><p>a</p></th><th><p>b</p></th></tr><tr><td><p>c</p></td><td><p>d</p></td></tr></tbody></table>'

  it("moves to the next cell and back, ahead of the doc's own Tab", async () => {
    const e = docEditor(grid)
    e.commands.setTextSelection(3)
    expect(caretCell(e)).toBe("a")
    expect(press(e, "Tab").defaultPrevented).toBe(true)
    expect(caretCell(e)).toBe("b")
    press(e, "Tab")
    expect(caretCell(e)).toBe("c")
    press(e, "Shift-Tab")
    expect(caretCell(e)).toBe("b")
  })

  it("adds a row after the last cell, the caret in its first", async () => {
    const e = docEditor(grid)
    const last = e.state.doc.content.size - 4
    e.commands.setTextSelection(last)
    expect(caretCell(e)).toBe("d")
    press(e, "Tab")
    expect(shape(table(e))).toHaveLength(3)
    expect(caretCell(e)).toBe("")
  })

  it("leaves Tab to the line outside a table", () => {
    const e = docEditor("<p>words</p>")
    press(e, "Tab")
    expect(table(e)).toBeUndefined()
    expect(e.getText()).toBe("words")
  })
})

describe("a table's cells", () => {
  it("keep their colour by name and their widths, through HTML", () => {
    const e = docEditor('<table><tbody><tr><th colwidth="140" data-background="sky"><p>a</p></th><td data-background="crimson"><p>b</p></td></tr></tbody></table>')
    const cells = table(e)!.content![0].content!
    expect(cells[0].attrs).toEqual(expect.objectContaining({ colwidth: [140], background: "sky" }))
    // Only the doc's colours, by name.
    expect(cells[1].attrs?.background).toBeNull()
    const html = e.getHTML()
    expect(html).toContain('data-background="sky"')
    expect(html).toContain('colwidth="140"')
    expect(html).toMatch(/<col style="width: 140px;?">/)
  })

  // Editing used to be added the first time a doc showed a table, and adding
  // plugins to an open editor makes every plugin view again (an open menu
  // closed, collaboration drew the whole doc again).
  it("have their editing from when the doc's editor is made: a table added changes none of its plugins", () => {
    const e = docEditor()
    const plugins = e.state.plugins
    expect(plugins.some((p) => (p as unknown as { key: string }).key.startsWith("tableColumnResizing"))).toBe(true)
    const spy = vi.spyOn(e, "registerPlugin")
    insertSimpleTable(e, { from: 1, to: 1 })
    expect(table(e)).toBeTruthy()
    expect(spy).not.toHaveBeenCalled()
    expect(e.state.plugins).toBe(plugins)
  })

  it("are coloured, headed and added to from the table's commands", async () => {
    const { TABLE_COMMANDS, colourCells, headerOn } = await import("./tableActions")
    const { addAtEnd } = await import("./tableEditing")
    const e = docEditor()
    insertSimpleTable(e, { from: 1, to: 1 })
    expect(colourCells(e, "moss")).toBe(true)
    expect(table(e)!.content![0].content![0].attrs?.background).toBe("moss")
    expect(headerOn(e, "row")).toBe(true)
    TABLE_COMMANDS.headerRow(e)
    expect(headerOn(e, "row")).toBe(false)
    addAtEnd(e, 0, "row")
    addAtEnd(e, 0, "column")
    expect(shape(table(e)).map((r) => r.length)).toEqual([4, 4, 4, 4])
  })
})

describe("pasting rows of text", () => {
  it("makes a 3×4 table of TSV, its first row the header", () => {
    const e = docEditor()
    paste(e, "Name\tOwner\tDue\nLaunch\tSam\tFri\nDocs\tPriya\tMon\nBlog\tLee\tTue")
    const t = table(e)
    expect(shape(t)).toEqual([
      ["tableHeader", "tableHeader", "tableHeader"],
      ["tableCell", "tableCell", "tableCell"],
      ["tableCell", "tableCell", "tableCell"],
      ["tableCell", "tableCell", "tableCell"],
    ])
    expect(t!.content![3].content![1].content![0].content![0].text).toBe("Lee")
  })

  it("reads CSV with quoted commas and quotes, and leaves prose alone", () => {
    expect(parseDelimited('Name,Note,Cost\nA,"one, two",3\nB,"say ""hi""",4')).toEqual([
      ["Name", "Note", "Cost"],
      ["A", "one, two", "3"],
      ["B", 'say "hi"', "4"],
    ])
    expect(parseDelimited("Hi Sam,\nThanks, Priya")).toBeNull()
    expect(parseDelimited("one line\twith a tab")).toBeNull()
    expect(parseDelimited("a\tb\nc")).toBeNull()
    expect(parseCsv('a,"open')).toBeNull()
    // Indented lines are indented text, not a table with an empty first column.
    expect(parseDelimited("\tfoo()\n\tbar()")).toBeNull()
  })

  it("keeps a quoted field's line breaks as line breaks in its cell", () => {
    const e = docEditor()
    paste(e, 'Name,Address,City\nSam,"1 High St\nFlat 2",Leeds\nPriya,"2 Low Rd",York')
    const cell = table(e)!.content![1].content![1].content![0]
    expect(cell.content!.map((n) => n.type)).toEqual(["text", "hardBreak", "text"])
    expect(e.getHTML()).toContain("1 High St<br>Flat 2")
  })

  it("stays text when pasted as plain (⇧) or into code", () => {
    const plain = docEditor()
    paste(plain, "a\tb\nc\td", true)
    expect(table(plain)).toBeUndefined()
    expect(plain.getText()).toContain("a\tb")
    const e = docEditor("<pre><code>x</code></pre>")
    e.commands.setTextSelection(2)
    paste(e, "a\tb\nc\td")
    expect(table(e)).toBeUndefined()
  })
})

describe("another person's change to a table", () => {
  it("is left as it came: this tab repairs only its own (I6)", async () => {
    const e = docEditor('<table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr><tr><td><p>c</p></td><td><p>d</p></td></tr></tbody></table><p>end</p>')
    const { schema } = e
    const cell = (t: string) => schema.nodes.tableCell.create(null, schema.nodes.paragraph.create(null, schema.text(t)))
    // A table whose second row lacks a cell, as two people's edits can leave one.
    const uneven = schema.nodes.table.create(null, [schema.nodes.tableRow.create(null, [cell("a"), cell("b")]), schema.nodes.tableRow.create(null, [cell("c")])])
    const at = 0
    const end = e.state.doc.child(0).nodeSize
    e.view.dispatch(e.state.tr.replaceWith(at, end, uneven).setMeta("y-sync$", { isChangeOrigin: true }))
    expect(shape(table(e)).map((r) => r.length)).toEqual([2, 1])
    // This tab's own change to it is repaired.
    e.view.dispatch(e.state.tr.replaceWith(at, e.state.doc.child(0).nodeSize, uneven))
    expect(shape(table(e)).map((r) => r.length)).toEqual([2, 2])
  })
})

describe("the table's view", () => {
  it("offers + for a row and a column to a writer, and nothing to a reader", async () => {
    const e = docEditor("<table><tbody><tr><td><p>a</p></td></tr></tbody></table>")
    expect(e.view.dom.querySelectorAll(".doc-table-add")).toHaveLength(2)
    const r = docEditor("<table><tbody><tr><td><p>a</p></td></tr></tbody></table>")
    r.setEditable(false)
    const reader = new Editor({ element: document.body.appendChild(document.createElement("div")), extensions: extensionsFor(bareContext("doc")), content: r.getHTML(), editable: false })
    editors.push(reader)
    expect(reader.view.dom.querySelectorAll(".doc-table-add")).toHaveLength(0)
  })

  it("draws its columns' widths, fixed when every column has one", () => {
    const e = docEditor('<table><tbody><tr><td colwidth="100"><p>a</p></td><td colwidth="150"><p>b</p></td></tr></tbody></table>')
    const t = e.view.dom.querySelector("table") as HTMLTableElement
    expect(t.firstElementChild?.tagName).toBe("COLGROUP")
    expect(t.style.width).toBe("250px")
    expect((e.view.dom.querySelector(".doc-table") as HTMLElement).hasAttribute("data-fixed")).toBe(true)
  })
})

describe("the table's menu", () => {
  it("opens from a pointer with nothing picked yet, and from a key on its first item", async () => {
    const { act, fireEvent } = await import("@testing-library/react")
    const { openTableMenu } = await import("./TableMenu")
    const e = docEditor()
    insertSimpleTable(e, { from: 1, to: 1 })
    // The editor takes focus a frame after it's asked to: let that happen first.
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    const menu = () => document.querySelector<HTMLElement>('[role="menu"]')!
    const items = () => Array.from(menu().querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])'))

    await act(async () => void openTableMenu({ editor: e, kind: "row" }))
    expect(document.activeElement).toBe(menu())
    expect(menu().querySelector("[data-highlighted]")).toBeNull()
    // ↑ from nothing goes to the last item, ↓ to the first.
    await act(async () => void fireEvent.keyDown(menu(), { key: "ArrowUp" }))
    expect(document.activeElement).toBe(items().at(-1))
    await act(async () => void openTableMenu({ editor: e, kind: "row" }))
    await act(async () => void fireEvent.keyDown(menu(), { key: "ArrowDown" }))
    expect(document.activeElement?.textContent).toBe("Insert above")

    await act(async () => void openTableMenu({ editor: e, kind: "row", keyboard: true }))
    expect(document.activeElement?.textContent).toBe("Insert above")
    expect(menu().querySelectorAll("[data-highlighted]")).toHaveLength(1)
  }, 15_000)
})

describe("Turn into database", () => {
  it("makes a table of the rows, private like its doc, and embeds it where the table was", async () => {
    vi.resetModules()
    const calls: Array<[string, ...unknown[]]> = []
    vi.doMock("@/services/tableService", () => ({
      tableFieldsKey: (id: string) => `/tables/${id}/fields`,
      createTable: async (input: unknown) => (calls.push(["createTable", input]), { id: "t-1" }),
      updateField: async (...a: unknown[]) => void calls.push(["updateField", ...a]),
      createField: async (_t: string, input: { name: string }) => (calls.push(["createField", input.name]), { id: `f-${input.name}` }),
      createRow: async (_t: string, values: unknown) => void calls.push(["createRow", values]),
      deleteTable: async () => void calls.push(["deleteTable"]),
    }))
    vi.doMock("@/lib/axiosInstance", () => ({
      default: {
        get: async (url: string) =>
          url.startsWith("/doc/") ? { data: { data: { doc_title: "Launch", doc_private: true } } } : { data: { data: [{ id: "f-name", position: 0, name: "Name" }] } },
      },
    }))
    vi.doMock("@/components/docEditor/registry/commandBus", async (orig) => ({ ...(await orig<object>()), busFor: () => ({ docId: "d-1" }) }))
    const { turnIntoDatabase } = await import("./toDatabase")
    const e = docEditor('<table><tbody><tr><th><p>Task</p></th><th><p>Owner</p></th></tr><tr><td><p>Ship</p></td><td><p>Sam</p></td></tr></tbody></table><p>after</p>')
    await turnIntoDatabase(e, 0)
    expect(calls[0]).toEqual(["createTable", { name: "Launch table", visibility: "private" }])
    expect(calls).toContainEqual(["updateField", "t-1", "f-name", { name: "Task" }])
    expect(calls).toContainEqual(["createField", "Owner"])
    expect(calls).toContainEqual(["createRow", { "f-name": "Ship", "f-Owner": "Sam" }])
    expect(e.getJSON().content?.[0]).toEqual(expect.objectContaining({ type: "tableEmbed", attrs: expect.objectContaining({ tableId: "t-1" }) }))
    vi.doUnmock("@/services/tableService")
    vi.doUnmock("@/lib/axiosInstance")
    vi.doUnmock("@/components/docEditor/registry/commandBus")
  })
})
