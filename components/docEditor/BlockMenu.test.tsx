import * as React from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { NodeSelection } from "@tiptap/pm/state"

vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useAIAvailable: () => false,
}))

import { actionById, registerAction, registerDialog } from "@/components/docEditor/registry/registry"
import { attachBus, createDocCommandBus } from "@/components/docEditor/registry/commandBus"
import type { ActionContext } from "@/components/docEditor/registry/types"
import { MediaQueryProvider } from "@/context/MediaQueryContext"
import { BlockSelection } from "@/components/minimal-tiptap/extensions/block-selection/blockSelection"
import { requestBlockMenu, type BlockMenuRequest } from "@/components/minimal-tiptap/extensions/block-commands/menuRequest"
import { docEditor, loadDocBlocks, outline, posOf } from "@/components/minimal-tiptap/extensions/block-commands/blockTestKit"
import BlockMenuHost from "./BlockMenu"
import { menuRows, prepare, searchRows } from "./blockMenuRows"
// The sheet is the menu's lazy part: loaded here, so it draws at once.
import "./BlockSheet"
import "./BlockMenuPopover"

beforeAll(loadDocBlocks, 60_000)
afterEach(cleanup)

// The block menu (editor.md P0-3, content.md D10, WAVE_B_CONTRACTS): the
// registry surface 'blockMenu' in its groups, Turn into and Text direction
// its own rows; each action given its blocks selected and ctx.state's range
// and anchor; all of it by keyboard.

const NO_AI = { ai: false }
const ANCHOR = { left: 40, top: 100, bottom: 124 }
const ask = (blocks: number[], via: BlockMenuRequest["via"] = "keys"): BlockMenuRequest => ({ blocks, anchor: ANCHOR, via })
const labels = (e: ReturnType<typeof docEditor>, req: BlockMenuRequest) => menuRows(e, "doc-1", NO_AI, req, () => {}).main.map((r) => r.label)

describe("the block menu's rows", () => {
  it("are Turn into, the block's actions in their groups, and Delete last", () => {
    const e = docEditor("<p>one</p><p>two</p><p>three</p>")
    e.view.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, posOf(e.state.doc, "two"))))
    expect(labels(e, ask([posOf(e.state.doc, "two")]))).toEqual([
      "Turn into",
      // B2's colour, on blockMenu (WAVE_B_CONTRACTS: colour.open).
      "Colour",
      "Text direction",
      "Copy link to block",
      "Duplicate",
      "Move up",
      "Move down",
      "Comment",
      "Delete",
    ])
  })

  it("leave out what can't be done: a move past the top, and edits in a doc read only (a link and a comment stay)", () => {
    const e = docEditor("<p>one</p><p>two</p>")
    e.view.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, 0)))
    expect(labels(e, ask([0]))).not.toContain("Move up")
    e.setEditable(false)
    expect(labels(e, ask([0]))).toEqual(["Copy link to block", "Comment"])
  })

  it("show Move to… only while there is a dialog to move them with", () => {
    const e = docEditor("<p>one</p><p>two</p>")
    e.view.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, 0)))
    expect(labels(e, ask([0]))).not.toContain("Move to…")
    registerDialog({ id: "doc.moveTo", edition: "both", load: async () => ({ default: () => null }) })
    expect(labels(e, ask([0]))).toContain("Move to…")
  })

  it("take in another package's action on 'blockMenu', in its group", () => {
    registerAction({ id: "test.colour", label: "Colour (test)", group: "style", order: 50, surfaces: ["blockMenu"], edition: "both", run: () => {} })
    const e = docEditor("<p>one</p>")
    e.view.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, 0)))
    const main = labels(e, ask([0]))
    // In the style group, after B2's own Colour (order 50 too, registered first).
    expect(main.slice(0, 4)).toEqual(["Turn into", "Colour", "Colour (test)", "Text direction"])
  })

  it("are found by search, with the lists' entries", () => {
    const e = docEditor("<p>one</p>")
    const rows = menuRows(e, "doc-1", NO_AI, ask([0]), () => {})
    expect(searchRows(rows, "dup").map((r) => r.label)).toEqual(["Duplicate"])
    expect(searchRows(rows, "rtl").map((r) => r.label)).toEqual(["Right to left"])
    expect(searchRows(rows, "heading 2").map((r) => r.label)).toContain("Heading 2")
  })
})

describe("an action from the menu", () => {
  it("has its block selected as a node, and the block's id, range and the menu's place in ctx.state", () => {
    const e = docEditor('<p data-block-id="b-0000001">one</p><p data-block-id="b-0000002">two</p>')
    const two = posOf(e.state.doc, "two")
    const ctx = prepare(e, "doc-1", NO_AI, ask([two]))!
    expect(e.state.selection).toBeInstanceOf(NodeSelection)
    expect(e.state.selection.from).toBe(two)
    expect(ctx.state?.blocks).toEqual(["b-0000002"])
    expect(ctx.state?.range).toEqual({ from: two, to: two + 5 })
    expect(ctx.state?.anchor).toEqual(ANCHOR)
  })

  it("names a block that has no id yet by one given it then, outside undo", () => {
    const e = docEditor("<p>one</p><p>two</p>")
    const two = posOf(e.state.doc, "two")
    const ctx = prepare(e, "doc-1", NO_AI, ask([two]))!
    const id = e.state.doc.nodeAt(two)!.attrs.blockId
    expect(typeof id).toBe("string")
    expect(ctx.state?.blocks).toEqual([id])
    expect(e.state.selection).toBeInstanceOf(NodeSelection)
  })

  it("has several blocks selected as blocks, named in document order", () => {
    const e = docEditor('<p data-block-id="b-0000001">one</p><p data-block-id="b-0000002">two</p><p data-block-id="b-0000003">three</p>')
    const doc = e.state.doc
    const ctx = prepare(e, "doc-1", NO_AI, ask([posOf(doc, "three"), 0]))!
    expect(e.state.selection).toBeInstanceOf(BlockSelection)
    expect((e.state.selection as BlockSelection).blocks).toEqual([0, posOf(doc, "three")])
    expect(ctx.state?.blocks).toEqual(["b-0000001", "b-0000003"])
    expect(ctx.state?.range).toEqual({ from: 0, to: doc.content.size })
  })

  it("acts on the blocks it names, whatever the selection became meanwhile", async () => {
    const e = docEditor('<p data-block-id="b-0000001">one</p><p data-block-id="b-0000002">two</p><p data-block-id="b-0000003">three</p>')
    const doc = e.state.doc
    const ctx = prepare(e, "doc-1", NO_AI, ask([0, posOf(doc, "three")]))!
    // A caret in "two" now: Delete still takes "one" and "three", and only them.
    e.commands.setTextSelection(posOf(e.state.doc, "two") + 1)
    await actionById("block.delete", NO_AI)!.run(ctx)
    expect(outline(e.state.doc)).toEqual(["paragraph:two"])
  })

  it("Turn into turns blocks chosen apart, and not those between them", () => {
    const e = docEditor("<p>one</p><p>two</p><p>three</p>")
    const doc = e.state.doc
    const req = ask([0, posOf(doc, "three")])
    e.view.dispatch(e.state.tr.setSelection(new BlockSelection(doc, req.blocks)))
    menuRows(e, "doc-1", NO_AI, req, () => {}).turn.find((r) => r.label === "Heading 2")!.run()
    expect(outline(e.state.doc)).toEqual(["heading:one", "paragraph:two", "heading:three"])
  })

  it("is not run on blocks that went meanwhile", () => {
    const e = docEditor("<p>one</p><p>two</p>")
    expect(prepare(e, "doc-1", NO_AI, ask([e.state.doc.content.size + 4]))).toBeNull()
  })
})

describe("the menu, drawn", () => {
  const open = (html: string, blocks: (e: ReturnType<typeof docEditor>) => number[]) => {
    const e = docEditor(html)
    attachBus(e, createDocCommandBus("doc-1"))
    render(
      <MediaQueryProvider>
        <BlockMenuHost docId="doc-1" editor={e} />
      </MediaQueryProvider>,
    )
    const chosen = blocks(e)
    e.view.dispatch(e.state.tr.setSelection(new BlockSelection(e.state.doc, chosen)))
    act(() => void requestBlockMenu(e, ask(chosen)))
    return e
  }
  const search = () => screen.getByRole("combobox", { name: "Search actions" })
  const key = (k: string) => fireEvent.keyDown(search(), { key: k })
  /** The highlighted row's name, as a screen reader hears it through the search field. */
  const activeName = () => document.getElementById(search().getAttribute("aria-activedescendant") ?? "")?.getAttribute("aria-label")

  it("opens at the block with the search focused, naming what is chosen", async () => {
    open("<h2>Title</h2><p>two</p>", () => [0])
    expect(await screen.findByRole("listbox", { name: "Block actions" })).toBeTruthy()
    expect(document.activeElement).toBe(search())
    expect(screen.getByText("Heading 2")).toBeTruthy()
  })

  it("runs the action ↓ and ↩ choose, on its blocks", async () => {
    const e = open("<p>one</p><p>two</p>", (ed) => [posOf(ed.state.doc, "one")])
    await screen.findByRole("listbox", { name: "Block actions" })
    fireEvent.change(search(), { target: { value: "dup" } })
    expect(activeName()).toBe("Duplicate")
    key("Enter")
    await act(async () => {})
    expect(outline(e.state.doc)).toEqual(["paragraph:one", "paragraph:one", "paragraph:two"])
    expect(screen.queryByRole("listbox", { name: "Block actions" })).toBeNull()
  })

  it("moves through its rows with the arrows, Home and End", async () => {
    open("<p>one</p><p>two</p>", () => [0])
    await screen.findByRole("listbox", { name: "Block actions" })
    const active = activeName
    const ids = screen.getAllByRole("option").map((o) => o.getAttribute("aria-label"))
    expect(active()).toBe("Turn into")
    key("ArrowDown")
    expect(active()).toBe(ids[1])
    key("End")
    expect(active()).toBe("Delete")
    key("ArrowDown")
    expect(active()).toBe("Turn into")
    key("ArrowUp")
    key("Home")
    expect(active()).toBe("Turn into")
  })

  it("opens Turn into beside it with →, back with ←, and turns the block with ↩", async () => {
    const e = open("<p>one</p>", () => [0])
    await screen.findByRole("listbox", { name: "Block actions" })
    key("ArrowRight")
    expect(screen.getByRole("listbox", { name: "Turn into" })).toBeTruthy()
    key("ArrowLeft")
    expect(screen.queryByRole("listbox", { name: "Turn into" })).toBeNull()
    key("ArrowRight")
    const rows = screen.getAllByRole("option").filter((o) => o.closest('[role="listbox"][aria-label="Turn into"]'))
    const h1 = rows.findIndex((o) => o.textContent?.startsWith("Heading 1"))
    for (let i = 0; i < h1; i++) key("ArrowDown")
    key("Enter")
    await act(async () => {})
    expect(e.state.doc.firstChild?.type.name).toBe("heading")
    expect(e.state.doc.firstChild?.attrs.level).toBe(1)
  })

  it("closes with Esc, or Tab, the blocks still chosen", async () => {
    const e = open("<p>one</p><p>two</p>", () => [0])
    await screen.findByRole("listbox", { name: "Block actions" })
    key("Escape")
    expect(screen.queryByRole("listbox", { name: "Block actions" })).toBeNull()
    expect(e.state.selection).toBeInstanceOf(BlockSelection)
    act(() => void requestBlockMenu(e, ask([0])))
    await screen.findByRole("listbox", { name: "Block actions" })
    key("Tab")
    expect(screen.queryByRole("listbox", { name: "Block actions" })).toBeNull()
  })

  it("gives a registered action its blocks and where the menu stood", async () => {
    const run = vi.fn((ctx: ActionContext) => void ctx)
    registerAction({ id: "test.ask", label: "Ask (test)", group: "ai", order: 1, surfaces: ["blockMenu"], edition: "both", run })
    const e = open("<p>one</p><p>two</p>", (ed) => [posOf(ed.state.doc, "two")])
    await screen.findByRole("listbox", { name: "Block actions" })
    fireEvent.click(screen.getByRole("option", { name: /Ask \(test\)/ }))
    await act(async () => {})
    expect(run).toHaveBeenCalledTimes(1)
    const ctx = run.mock.calls[0][0]
    const two = posOf(e.state.doc, "two")
    expect(ctx.state?.range).toEqual({ from: two, to: two + 5 })
    expect(ctx.state?.anchor).toEqual(ANCHOR)
    expect(ctx.docId).toBe("doc-1")
    expect(e.state.selection).toBeInstanceOf(NodeSelection)
  })
})

describe("the phone's sheet (a long-press)", () => {
  it("has the menu's actions; a move keeps it open for the block where it went, Delete closes it", async () => {
    const e = docEditor("<p>one</p><p>two</p><p>three</p>")
    attachBus(e, createDocCommandBus("doc-1"))
    render(
      <MediaQueryProvider>
        <BlockMenuHost docId="doc-1" editor={e} />
      </MediaQueryProvider>,
    )
    const two = posOf(e.state.doc, "two")
    e.view.dispatch(e.state.tr.setSelection(new BlockSelection(e.state.doc, [two])))
    act(() => void requestBlockMenu(e, ask([two], "press")))
    fireEvent.click(await screen.findByRole("button", { name: "Move down" }, { timeout: 10_000 }))
    await act(async () => void (await new Promise((r) => setTimeout(r, 20))))
    expect(outline(e.state.doc)).toEqual(["paragraph:one", "paragraph:three", "paragraph:two"])
    // Still open, now for "two" at the bottom: it can only go up.
    expect(screen.getByRole("button", { name: "Move up" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Move down" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    await act(async () => void (await new Promise((r) => setTimeout(r, 20))))
    expect(outline(e.state.doc)).toEqual(["paragraph:one", "paragraph:three"])
    expect(screen.queryByRole("button", { name: "Move up" })).toBeNull()
  })

  it("opens Turn into in the sheet, with a way back", async () => {
    const e = docEditor("<p>one</p>")
    render(
      <MediaQueryProvider>
        <BlockMenuHost docId="doc-1" editor={e} />
      </MediaQueryProvider>,
    )
    act(() => void requestBlockMenu(e, ask([0], "press")))
    fireEvent.click(await screen.findByRole("button", { name: "Turn into" }, { timeout: 10_000 }))
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /^Heading 2/ }))
    await act(async () => {})
    expect(e.state.doc.firstChild?.attrs.level).toBe(2)
  })
})
