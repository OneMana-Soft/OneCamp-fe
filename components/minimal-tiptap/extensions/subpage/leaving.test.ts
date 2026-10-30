import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { Editor } from "@tiptap/core"

// Body to tree (docs C7a): a child page whose last block the person deletes
// goes to the trash, with Undo; links, other people's edits, blocks moved to
// another doc and an agent's accepted rewrite leave pages where they are.

const hoisted = vi.hoisted(() => ({ trash: vi.fn(), readNow: vi.fn(), undo: vi.fn(), post: vi.fn() }))
vi.mock("@/components/docTree/docActions", () => ({ trash: hoisted.trash }))
vi.mock("@/lib/liveEntity", async (real) => ({ ...(await real<typeof import("@/lib/liveEntity")>()), readNow: hoisted.readNow }))
vi.mock("@/store/store", () => ({ default: { dispatch: vi.fn() } }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: (...a: unknown[]) => hoisted.post(...a) } }))

import { attachBus, createDocCommandBus } from "@/components/docEditor/registry/commandBus"
import { stageBlockMove, peekBlockMove } from "@/components/docEditor/blockMove"
import { acceptIn, proposeReplacement } from "@/lib/proposals/review"
import { docEditor, loadDocBlocks } from "../block-commands/blockTestKit"
import { isLeaving, pagesHeld, touchesPages, watchLeaving } from "./leaving"

const DOC = "d0c00000-0000-4000-8000-0000000000d1"
const CHILD = "c4110000-0000-4000-8000-0000000000c1"
const LINKED = "11ec0000-0000-4000-8000-0000000000e1"
const block = (id: string) => `<div data-type="subpage" data-doc-id="${id}"></div>`

beforeAll(loadDocBlocks, 60_000)

const detach: Array<() => void> = []
beforeEach(() => {
  for (const f of [hoisted.trash, hoisted.readNow, hoisted.undo, hoisted.post]) f.mockReset()
  hoisted.readNow.mockImplementation(async (_kind: string, id: string) =>
    id === CHILD ? { state: "ok", data: { title: "Launch plan", parent_id: DOC } } : { state: "ok", data: { title: "Elsewhere", parent_id: "0f0f0f0f-0000-4000-8000-000000000000" } },
  )
  hoisted.trash.mockImplementation(async () => ({ undo: hoisted.undo }))
})
afterEach(() => detach.splice(0).forEach((f) => f()))

function mount(html: string): Editor {
  const e = docEditor(html)
  detach.push(attachBus(e, createDocCommandBus(DOC)))
  return e
}
const pagesIn = (e: Editor) => {
  const out: string[] = []
  e.state.doc.descendants((n) => void (n.type.name === "subpage" && out.push(n.attrs.docId)))
  return out
}
const blockAt = (e: Editor, page: string) => {
  let at = -1
  e.state.doc.descendants((n, pos) => void (at < 0 && n.type.name === "subpage" && n.attrs.docId === page && (at = pos)))
  return at
}
const remove = (e: Editor, page: string, meta: Record<string, unknown> = {}) => {
  const at = blockAt(e, page)
  const tr = e.state.tr.delete(at, at + 1)
  for (const [k, v] of Object.entries(meta)) tr.setMeta(k, v)
  e.view.dispatch(tr)
}
const putIn = (e: Editor, page: string, at: number, meta: Record<string, unknown> = {}) => {
  const tr = e.state.tr.insert(at, e.schema.nodes.subpage.create({ docId: page }))
  for (const [k, v] of Object.entries(meta)) tr.setMeta(k, v)
  e.view.dispatch(tr)
}
// Lets the lazy part load, and what it started run out.
const settle = async () => {
  await vi.dynamicImportSettled()
  await new Promise((r) => setTimeout(r, 0))
}

describe("a page's block deleted from its parent", () => {
  it("puts a child page in the trash, as this doc's child, named as it is now", async () => {
    const e = mount(`<p>One</p>${block(CHILD)}<p>Two</p>`)
    remove(e, CHILD)
    await vi.waitFor(() => expect(hoisted.trash).toHaveBeenCalledTimes(1))
    const [, doc, here, from] = hoisted.trash.mock.calls[0]
    expect(doc).toEqual({ id: CHILD, title: "Launch plan", icon: undefined })
    expect(here).toMatchObject({ onItsPage: false })
    expect(from).toMatchObject({ parent: DOC })
  })

  it("leaves a page that lives elsewhere: its block was a link", async () => {
    const e = mount(`<p>One</p>${block(LINKED)}`)
    remove(e, LINKED)
    await vi.waitFor(() => expect(hoisted.readNow).toHaveBeenCalledWith("doc", LINKED))
    await settle()
    expect(hoisted.trash).not.toHaveBeenCalled()
  })

  it("leaves a page that still has a block in the body, or whose block moved within it", async () => {
    const e = mount(`<p>One</p>${block(CHILD)}<p>Two</p>${block(CHILD)}`)
    remove(e, CHILD)
    const at = blockAt(e, CHILD)
    const tr = e.state.tr.delete(at, at + 1)
    e.view.dispatch(tr.insert(1, e.schema.nodes.subpage.create({ docId: CHILD })))
    await settle()
    expect(pagesIn(e)).toEqual([CHILD])
    expect(hoisted.readNow).not.toHaveBeenCalled()
    expect(hoisted.trash).not.toHaveBeenCalled()
  })

  it("leaves pages alone for someone else's edit, a move of blocks to another doc and an agent's accepted rewrite", async () => {
    const theirs = mount(`<p>One</p>${block(CHILD)}`)
    remove(theirs, CHILD, { "y-sync$": { isChangeOrigin: true } })

    hoisted.post.mockResolvedValue({ data: { ok: true } })
    const moved = mount(`<p data-block-id="b-0000001">One</p><div data-type="subpage" data-doc-id="${CHILD}" data-block-id="b-0000002"></div>`)
    const at = blockAt(moved, CHILD)
    expect(stageBlockMove(DOC, moved, { from: at, to: at + 1 })).toBe(true)
    await peekBlockMove(DOC)!.moveTo("0d0c0000-0000-4000-8000-0000000000aa")

    const rewritten = mount(`<p>One</p>${block(CHILD)}<p>Two</p>`)
    const where = blockAt(rewritten, CHILD)
    const tracked = proposeReplacement(rewritten.state, where, where + 1, [{ type: "paragraph", content: [{ type: "text", text: "Rewritten" }] }])!
    acceptIn(rewritten.state, (tr) => rewritten.view.dispatch(tr), tracked)

    await settle()
    expect([pagesIn(theirs), pagesIn(moved), pagesIn(rewritten)]).toEqual([[], [], []])
    expect(hoisted.trash).not.toHaveBeenCalled()
  })

  it("puts the block back where it was when the toast's Undo brings the page back", async () => {
    const e = mount(`<p>One</p>${block(CHILD)}<p>Two</p>`)
    remove(e, CHILD)
    await vi.waitFor(() => expect(hoisted.trash).toHaveBeenCalledTimes(1))
    e.view.dispatch(e.state.tr.insertText("Zero, ", 1))
    hoisted.trash.mock.calls[0][3].putBack()
    expect(e.state.doc.child(0).textContent).toBe("Zero, One")
    expect(e.state.doc.child(1).attrs.docId).toBe(CHILD)
    // The editor's own Undo had put it back first: no second block.
    hoisted.trash.mock.calls[0][3].putBack()
    expect(pagesIn(e)).toEqual([CHILD])
  })

  it("brings the page back when its block comes back by the person's Undo or a paste, once, and never by someone else's edit", async () => {
    const e = mount(`<p>One</p>${block(CHILD)}<p>Two</p>`)
    remove(e, CHILD)
    await vi.waitFor(() => expect(hoisted.trash).toHaveBeenCalledTimes(1))
    await settle()
    putIn(e, CHILD, 5, { "y-sync$": { isChangeOrigin: true } })
    expect(hoisted.undo).not.toHaveBeenCalled()
    putIn(e, CHILD, 5, { "y-sync$": { isChangeOrigin: true, isUndoRedoOperation: true } })
    putIn(e, CHILD, 5)
    expect(hoisted.undo).toHaveBeenCalledTimes(1)
  })
})

// What "Pages inside" reads of the body (docs C7a part 4): which pages it
// holds a block of, which changes add or take one, and which pages are on
// their way to the trash, so the list never shows one for the moment its
// trash takes.
describe("the body's pages, for Pages inside", () => {
  it("knows every page the body holds a block of, at any depth", () => {
    const e = mount(`<p>One</p>${block(CHILD)}<blockquote>${block(LINKED)}</blockquote><p>Two</p>`)
    expect([...pagesHeld(e.state.doc)].sort()).toEqual([CHILD, LINKED].sort())
    expect(pagesHeld(docEditor("<p>Nothing here</p>").state.doc).size).toBe(0)
  })

  it("tells a change to the body's pages, the person's or someone else's, from one that only types", () => {
    const e = mount(`<p>One</p>${block(CHILD)}<p>Two</p>`)
    const seen: boolean[] = []
    e.on("transaction", ({ transaction }) => void seen.push(touchesPages(transaction)))
    e.commands.insertContentAt(2, "x")
    putIn(e, LINKED, 1)
    remove(e, LINKED, { "y-sync$": { isChangeOrigin: true } })
    e.view.dispatch(e.state.tr.setSelection(e.state.selection))
    expect(seen).toEqual([false, true, true, false])
  })

  it("holds a page as leaving from its block's deletion until its trash answers, and says when that changes", async () => {
    let answer: (gone: null) => void = () => undefined
    hoisted.trash.mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    const heard = vi.fn()
    detach.push(watchLeaving(heard))
    const e = mount(`<p>One</p>${block(CHILD)}<p>Two</p>`)
    remove(e, CHILD)
    expect(isLeaving(CHILD)).toBe(true)
    expect(heard).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(hoisted.trash).toHaveBeenCalledTimes(1))
    // Refused (or failed): the page stays this doc's child.
    answer(null)
    await vi.waitFor(() => expect(isLeaving(CHILD)).toBe(false))
    expect(heard).toHaveBeenCalledTimes(2)
    expect(isLeaving(LINKED)).toBe(false)
  })
})
