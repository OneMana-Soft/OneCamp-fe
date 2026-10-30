import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { Editor } from "@tiptap/core"

// Move to… on a child page's block (docs C7a part 4): the block menu moves
// the page itself, and the tree takes its block along (C7a part 2). B1's
// Move to…, which moves blocks to another doc and leaves their pages where
// they are, stays for every other block.

const hoisted = vi.hoisted(() => ({ snapshot: vi.fn() }))
vi.mock("@/lib/liveEntity", async (real) => ({ ...(await real<typeof import("@/lib/liveEntity")>()), snapshot: hoisted.snapshot }))

import { actionById } from "@/components/docEditor/registry/registry"
import { attachBus, createDocCommandBus } from "@/components/docEditor/registry/commandBus"
import type { ActionContext } from "@/components/docEditor/registry/types"
import { offerPageActions } from "@/components/docEditor/chrome/contributions"
import { peekStagedDrop } from "@/components/docEditor/chrome/stagedDrop"
import { docEditor, loadDocBlocks } from "../block-commands/blockTestKit"

const DOC = "d0c00000-0000-4000-8000-0000000000d1"
const CHILD = "c4110000-0000-4000-8000-0000000000c1"
const LINKED = "11ec0000-0000-4000-8000-0000000000e1"
const GATE = { ai: false }
const block = (id: string) => `<div data-type="subpage" data-doc-id="${id}"></div>`

beforeAll(async () => {
  await loadDocBlocks()
  offerPageActions()
}, 60_000)

const detach: Array<() => void> = []
beforeEach(() => {
  hoisted.snapshot.mockReset()
  hoisted.snapshot.mockImplementation((_kind: string, id: string) =>
    id === CHILD ? { state: "ok", data: { title: "Budget", parent_id: DOC } } : { state: "ok", data: { title: "Elsewhere", parent_id: "0f0f0f0f-0000-4000-8000-000000000000" } },
  )
})
afterEach(() => detach.splice(0).forEach((f) => f()))

/** The block menu's context for the blocks from..to, as blockMenuRows gives it. */
function menuOn(html: string, pick: (e: Editor) => { from: number; to: number }, canEdit = true): { ctx: ActionContext; opened: string[] } {
  const editor = docEditor(html)
  const bus = createDocCommandBus(DOC)
  detach.push(attachBus(editor, bus))
  const opened: string[] = []
  detach.push(bus.on("openDialog", ({ id }) => void opened.push(id)))
  return { ctx: { docId: DOC, editor, canEdit, bus, gate: GATE, state: { range: pick(editor) } }, opened }
}

/** The range of the first block of a page. */
const pageBlock = (page: string) => (e: Editor) => {
  let range = { from: -1, to: -1 }
  e.state.doc.descendants((n, pos) => void (range.from < 0 && n.attrs.docId === page && (range = { from: pos, to: pos + n.nodeSize })))
  return range
}

const shown = (id: string, ctx: ActionContext) => !!actionById(id, GATE)?.isVisible?.(ctx)

describe("Move to… on a page's block", () => {
  it("moves a child page: its page is staged, with no target, and the dialog opens; B1's move hides", async () => {
    const { ctx, opened } = menuOn(`<p>One</p>${block(CHILD)}<p>Two</p>`, pageBlock(CHILD))
    expect(shown("subpage.moveTo", ctx)).toBe(true)
    expect(shown("block.moveTo", ctx)).toBe(false)
    await actionById("subpage.moveTo", GATE)!.run(ctx)
    expect(opened).toEqual(["doc.moveTo"])
    expect(peekStagedDrop(DOC)).toEqual({ page: { uuid: CHILD, title: "Budget" } })
  })

  it("leaves a link, several blocks, a page not read yet and a reader to B1's Move to… or nothing", () => {
    const link = menuOn(`<p>One</p>${block(LINKED)}`, pageBlock(LINKED)).ctx
    expect(shown("subpage.moveTo", link)).toBe(false)
    expect(shown("block.moveTo", link)).toBe(true)

    const two = menuOn(`${block(CHILD)}<p>Two</p>`, (e) => ({ from: 0, to: e.state.doc.content.size })).ctx
    expect(shown("subpage.moveTo", two)).toBe(false)
    expect(shown("block.moveTo", two)).toBe(true)

    hoisted.snapshot.mockReturnValue({ state: "loading" })
    const unread = menuOn(`<p>One</p>${block(CHILD)}`, pageBlock(CHILD)).ctx
    expect(shown("subpage.moveTo", unread)).toBe(false)

    hoisted.snapshot.mockReturnValue({ state: "ok", data: { title: "Budget", parent_id: DOC } })
    const reader = menuOn(`<p>One</p>${block(CHILD)}`, pageBlock(CHILD), false).ctx
    expect(shown("subpage.moveTo", reader)).toBe(false)
    expect(shown("block.moveTo", reader)).toBe(false)
  })
})
