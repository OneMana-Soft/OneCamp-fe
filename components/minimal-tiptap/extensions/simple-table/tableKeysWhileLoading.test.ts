import { afterAll, describe, expect, it, vi } from "vitest"
import type { Editor } from "@tiptap/core"
import { blocksReady } from "@/components/docEditor/registry/factory"
import { ALL_EDITIONS } from "@/components/docEditor/registry/manifest"
import { docEditor, loadDocBlocks, press } from "../block-commands/blockTestKit"
import { insertSimpleTable } from "./simpleTable"

// Tab in a table, and table editing's chunk (tableEditing.ts), which a doc
// fetches the first time it holds a table (registry/onDemand.ts). A new
// table's Tab once came before the chunk did on a slow connection: the key was
// swallowed, and what was typed next went into the cell it left ("StepOwner").
// Moving between cells needs only the doc; the row after the last cell comes
// with the chunk, as soon as it does, the caret in it. The chunk is held here
// until the test lets it go.
const held = vi.hoisted(() => {
  let release = () => {}
  const until = new Promise<void>((r) => (release = r))
  return { until, release: () => release() }
})
vi.mock("./tableEditing", async (importOriginal) => {
  await held.until
  return importOriginal()
})

// Never left held: an import still waiting would outlive the file.
afterAll(() => held.release())

/** Each row's cells, by their text. */
function cells(e: Editor): string[][] {
  const rows: string[][] = []
  e.state.doc.descendants((n) => {
    if (n.type.name === "tableRow") rows.push([])
    else if (n.type.name === "tableCell" || n.type.name === "tableHeader") {
      rows[rows.length - 1].push(n.textContent)
      return false
    }
    return true
  })
  return rows
}

describe("Tab in a table", () => {
  it("moves between cells while its editing is on its way, and adds the row after the last as soon as it comes", async () => {
    await loadDocBlocks()
    // A doc without a table is built without waiting for table editing; one
    // whose saved copy holds a table waits for it.
    expect(blocksReady("doc", ALL_EDITIONS)).toBe(true)
    expect(blocksReady("doc", ALL_EDITIONS, "<table><tbody><tr><td><p>a</p></td></tr></tbody></table>")).toBe(false)

    const e = docEditor("<p></p>")
    insertSimpleTable(e, { from: 1, to: 1 })
    e.commands.insertContent("Step")
    expect(press(e, "Tab").defaultPrevented).toBe(true)
    e.commands.insertContent("Owner")
    expect(cells(e)[0]).toEqual(["Step", "Owner", ""])
    // ⇧Tab goes back, the cell's text chosen.
    press(e, "Shift-Tab")
    expect(e.state.doc.textBetween(e.state.selection.from, e.state.selection.to)).toBe("Step")
    // Eight cells on is the last; one more asks for a row, which waits for the editing.
    for (let i = 0; i < 9; i++) expect(press(e, "Tab").defaultPrevented).toBe(true)
    expect(cells(e)).toHaveLength(3)
    held.release()
    await vi.waitFor(() => expect(cells(e)).toHaveLength(4))
    e.commands.insertContent("next")
    expect(cells(e)[3]).toEqual(["next", "", ""])
    expect(blocksReady("doc", ALL_EDITIONS, "<table><tbody><tr><td><p>a</p></td></tr></tbody></table>")).toBe(true)
  }, 30_000)
})
