import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { Editor, type JSONContent } from "@tiptap/core"
import { CellSelection, columnResizingPluginKey } from "@tiptap/pm/tables"
import * as Y from "yjs"
import "@/components/docEditor/registry"
import { blocksFor } from "@/components/docEditor/registry/registry"
import { blocksReady, extensionsFor, loadBlocks } from "@/components/docEditor/registry/factory"
import { ALL_EDITIONS, bareContext } from "@/components/docEditor/registry/manifest"
import { forgetOnDemand, onDemandApi } from "@/components/docEditor/registry/onDemand"
import { offlineProvider } from "@/components/docEditor/docTestKit"
import { docEditor, loadDocBlocks, loadDocBlocksFor, press } from "../block-commands/blockTestKit"
import { insertSimpleTable } from "./simpleTable"
import { TABLE_EDITING } from "@/components/docEditor/technical/onDemandIds"

// Table editing on demand (registry/onDemand.ts, technical/register.ts): a doc
// fetches prosemirror-tables the first time it holds a table, whichever way
// the table comes, and its editor's plugins stay the ones it was made with.
// Each test starts as a fresh page would, with nothing fetched.

const spec = () => blocksFor("doc", ALL_EDITIONS).find((s) => s.id === TABLE_EDITING)!.onDemand!
let fetches: ReturnType<typeof vi.spyOn>

// jsdom has no ClipboardEvent, which a paste is made of (prosemirror-view pasteHTML).
beforeAll(() => {
  if (typeof globalThis.ClipboardEvent === "undefined") {
    ;(globalThis as { ClipboardEvent?: unknown }).ClipboardEvent = class extends Event {
      clipboardData = null
    }
  }
})
beforeAll(async () => {
  await loadDocBlocks()
  await loadBlocks("guest", ALL_EDITIONS)
}, 30_000)
beforeEach(() => {
  forgetOnDemand()
  fetches = vi.spyOn(spec(), "load")
})
afterEach(() => fetches.mockRestore())

const table = (e: Editor) => e.getJSON().content?.find((n) => n.type === "table")
const here = (e: Editor) => vi.waitFor(() => expect(onDemandApi(e, TABLE_EDITING)).toBeTruthy())

/** The positions of the doc's first table's cells, in order. */
function cellsOf(e: Editor): number[] {
  const cells: number[] = []
  let tables = 0
  e.state.doc.descendants((n, pos) => {
    if (n.type.name === "table") tables++
    if (tables > 1) return false
    if (n.type.name === "tableCell" || n.type.name === "tableHeader") {
      cells.push(pos)
      return false
    }
    return true
  })
  return cells
}

/** Table editing works on this editor's table: its handles, column resizing, cell selection and its keys. */
function editingIsLive(e: Editor) {
  expect(e.view.dom.querySelectorAll('[aria-label="Row options"]')).toHaveLength(1)
  // Column resizing: its handle, set as it sets one, shows the cursor and the handle.
  const [first, second] = cellsOf(e)
  e.view.dispatch(e.state.tr.setMeta(columnResizingPluginKey, { setHandle: first }))
  expect(columnResizingPluginKey.getState(e.state)?.activeHandle).toBe(first)
  expect(e.view.dom.classList.contains("resize-cursor")).toBe(true)
  expect(e.view.dom.querySelector(".column-resize-handle")).not.toBeNull()
  e.view.dispatch(e.state.tr.setMeta(columnResizingPluginKey, { setHandle: -1 }))
  // Cell selection is drawn, and its keys are table editing's: → leaves it for the text beside.
  e.view.dispatch(e.state.tr.setSelection(CellSelection.create(e.state.doc, first, second)))
  expect(e.view.dom.querySelectorAll(".selectedCell")).toHaveLength(2)
  press(e, "ArrowRight")
  expect(e.state.selection).not.toBeInstanceOf(CellSelection)
  // And ⌫ over every cell takes the table away.
  const cells = cellsOf(e)
  e.view.dispatch(e.state.tr.setSelection(CellSelection.create(e.state.doc, cells[0], cells[cells.length - 1])))
  press(e, "Backspace")
  expect(table(e)).toBeUndefined()
}

describe("a doc's table editing", () => {
  it("is never fetched by a doc that holds no table, typed in, pasted into, rewritten", async () => {
    expect(blocksReady("doc", ALL_EDITIONS, "<p>Launch plan</p>")).toBe(true)
    const e = docEditor("<p>Launch plan</p>")
    e.commands.insertContent(" for Thursday")
    e.view.pasteText("a pasted line")
    e.view.pasteHTML("<p>pasted <b>words</b></p><ul><li><p>a list</p></li></ul>")
    e.commands.setContent("<h2>Rewritten</h2><p>still no table</p>")
    await new Promise((r) => setTimeout(r, 20))
    expect(fetches).not.toHaveBeenCalled()
    expect(onDemandApi(e, TABLE_EDITING)).toBeUndefined()
  })

  it("is fetched when the doc's first table comes from the / menu, and works on it, no plugin added", async () => {
    const e = docEditor("<p></p>")
    const plugins = e.state.plugins
    const added = vi.spyOn(e, "registerPlugin")
    insertSimpleTable(e, { from: 1, to: 1 })
    await here(e)
    expect(fetches).toHaveBeenCalledTimes(1)
    editingIsLive(e)
    expect(added).not.toHaveBeenCalled()
    expect(e.state.plugins).toBe(plugins)
  })

  it("is fetched for a pasted table", async () => {
    const e = docEditor("<p>Above</p>")
    e.view.pasteHTML("<table><tbody><tr><th><p>Step</p></th><th><p>Owner</p></th></tr><tr><td><p>Ship</p></td><td><p>Sam</p></td></tr></tbody></table>")
    expect(table(e)).toBeTruthy()
    await here(e)
    expect(fetches).toHaveBeenCalledTimes(1)
    editingIsLive(e)
  })

  it("is fetched for a table in Doc AI's answer, put in as its blocks", async () => {
    const e = docEditor("<p>Ask here</p>")
    const cell = (text: string): JSONContent => ({ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })
    e.commands.insertContent([{ type: "table", content: [{ type: "tableRow", content: [cell("a"), cell("b")] }, { type: "tableRow", content: [cell("c"), cell("d")] }] }])
    await here(e)
    expect(fetches).toHaveBeenCalledTimes(1)
    editingIsLive(e)
  })

  // The risky case: a doc open here with no table, and another person adds
  // one. It comes as y-prosemirror brings every change from Yjs, one
  // transaction replacing the whole doc, not as the steps of an insert.
  it("is fetched when another person's edit brings the doc's first table, and works on it, no plugin added", async () => {
    const theirsDoc = new Y.Doc()
    const mineDoc = new Y.Doc()
    const REMOTE = "remote"
    theirsDoc.on("update", (u: Uint8Array, origin: unknown) => origin !== REMOTE && Y.applyUpdate(mineDoc, u, REMOTE))
    mineDoc.on("update", (u: Uint8Array, origin: unknown) => origin !== REMOTE && Y.applyUpdate(theirsDoc, u, REMOTE))
    const collaboration = (who: string) => ({ enabled: true, documentId: "doc-1", username: who, userId: who })
    // Theirs: an editor with the table's nodes and no table editing (the guest's blocks), so only mine fetches.
    const theirs = new Editor({
      element: document.body.appendChild(document.createElement("div")),
      extensions: extensionsFor({ ...bareContext("guest", ALL_EDITIONS), collaboration: collaboration("u-kai"), provider: offlineProvider(theirsDoc) }),
    })
    const mine = new Editor({
      element: document.body.appendChild(document.createElement("div")),
      extensions: extensionsFor({ ...bareContext("doc", ALL_EDITIONS), collaboration: collaboration("u-sam"), provider: offlineProvider(mineDoc) }),
    })
    try {
      theirs.commands.insertContent("Plan")
      expect(mine.getText()).toContain("Plan")
      expect(fetches).not.toHaveBeenCalled()
      const plugins = mine.state.plugins
      const added = vi.spyOn(mine, "registerPlugin")
      insertSimpleTable(theirs, { from: theirs.state.doc.content.size - 1, to: theirs.state.doc.content.size - 1 })
      expect(table(mine)).toBeTruthy()
      await here(mine)
      expect(fetches).toHaveBeenCalledTimes(1)
      editingIsLive(mine)
      expect(added).not.toHaveBeenCalled()
      expect(mine.state.plugins).toBe(plugins)
    } finally {
      theirs.destroy()
      mine.destroy()
    }
  })

  it("is fetched before the editor is built for a doc whose saved copy holds a table, and works from its first frame", async () => {
    const saved = "<table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table><p>end</p>"
    expect(blocksReady("doc", ALL_EDITIONS, saved)).toBe(false)
    await loadDocBlocksFor(saved)
    expect(fetches).toHaveBeenCalledTimes(1)
    expect(blocksReady("doc", ALL_EDITIONS, saved)).toBe(true)
    const e = docEditor(saved)
    // Here at once: no change has had to come first.
    expect(onDemandApi(e, TABLE_EDITING)).toBeTruthy()
    editingIsLive(e)
  })
})

// When the chunk can't come, the doc keeps its table and asks again later:
// offline, once the connection is back (as the clipboard's writer waits,
// clipboardMarkdown.ts); after a failed fetch, at the first change past a
// pause, never with each key. A key that needed it meanwhile (Tab past the
// last cell) does nothing, then or later.
describe("a doc's table editing, when it can't be fetched", () => {
  const rows = (e: Editor) => table(e)?.content?.length ?? 0
  /** The caret in the first table's last cell. */
  function inLastCell(e: Editor) {
    const cells = cellsOf(e)
    e.commands.setTextSelection(cells[cells.length - 1] + 2)
  }

  it("waits for the connection, and comes with the first change after it", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    try {
      const e = docEditor("<p></p>")
      insertSimpleTable(e, { from: 1, to: 1 })
      e.commands.insertContent("Step")
      inLastCell(e)
      expect(press(e, "Tab").defaultPrevented).toBe(true)
      await new Promise((r) => setTimeout(r, 20))
      expect(fetches).not.toHaveBeenCalled()
      online.mockReturnValue(true)
      e.commands.insertContent("Owner")
      await here(e)
      expect(fetches).toHaveBeenCalledTimes(1)
      // The row Tab asked for offline isn't added now.
      expect(rows(e)).toBe(3)
      editingIsLive(e)
    } finally {
      online.mockRestore()
    }
  })

  it("is asked for again by the first change past a pause after a failed fetch, not by each key", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    let now = Date.now()
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now)
    fetches.mockRejectedValueOnce(new Error("Loading chunk 4417 failed."))
    try {
      const e = docEditor("<p></p>")
      insertSimpleTable(e, { from: 1, to: 1 })
      // Tab past the last cell while the fetch that fails is on its way.
      inLastCell(e)
      expect(press(e, "Tab").defaultPrevented).toBe(true)
      await vi.waitFor(() => expect(logged).toHaveBeenCalledTimes(1))
      for (const key of "Step") e.commands.insertContent(key)
      await new Promise((r) => setTimeout(r, 20))
      expect(fetches).toHaveBeenCalledTimes(1)
      now += 5_000
      e.commands.insertContent("s")
      await here(e)
      expect(fetches).toHaveBeenCalledTimes(2)
      // The row Tab asked of the fetch that failed isn't added now.
      expect(rows(e)).toBe(3)
      editingIsLive(e)
    } finally {
      clock.mockRestore()
      logged.mockRestore()
    }
  })
})
