import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NodeSelection } from "@tiptap/pm/state"

const post = vi.fn()
vi.mock("@/lib/axiosInstance", () => ({ default: { post: (...a: unknown[]) => post(...a) }, OWN_ERRORS: { suppressErrorToast: true } }))

import { APPEND_BLOCKS_URL, peekBlockMove, releaseBlockMove, stageBlockMove } from "./blockMove"
import { docEditor, loadDocBlocks, outline, posOf } from "@/components/minimal-tiptap/extensions/block-commands/blockTestKit"

beforeAll(loadDocBlocks, 60_000)
beforeEach(() => post.mockReset())

// Move to… for blocks (WAVE_B_CONTRACTS "Dialogs"): the block menu stages
// the blocks, B6's dialog takes them once and awaits moveTo(target); the
// blocks reach the target through the API, then go from here in one change.
// A refusal says what happened and leaves them.

const doc = '<p data-block-id="b-0000001">one</p><p data-block-id="b-0000002">two</p><p data-block-id="b-0000003" data-indent="1">child</p><ul><li data-block-id="b-0000004"><p>item</p></li></ul>'
const range = (e: ReturnType<typeof docEditor>, text: string) => {
  const pos = posOf(e.state.doc, text)
  return { from: pos, to: pos + e.state.doc.nodeAt(pos)!.nodeSize }
}

describe("moving blocks to another doc", () => {
  it("stages the blocks with their children for the dialog, until the dialog showing them lets go", () => {
    const e = docEditor(doc)
    expect(stageBlockMove("doc-1", e, range(e, "two"))).toBe(true)
    const move = peekBlockMove("doc-1")
    expect(move?.count).toBe(2)
    expect(peekBlockMove("doc-1")).toBe(move)
    releaseBlockMove(move!)
    expect(peekBlockMove("doc-1")).toBeNull()
  })

  it("adds them at the target's end, then takes them from here", async () => {
    post.mockResolvedValue({ data: { ok: true } })
    const e = docEditor(doc)
    stageBlockMove("doc-1", e, range(e, "two"))
    await peekBlockMove("doc-1")!.moveTo("doc-2")
    expect(post).toHaveBeenCalledTimes(1)
    const [url, body] = post.mock.calls[0]
    expect(url).toBe(APPEND_BLOCKS_URL)
    expect(body.doc_uuid).toBe("doc-2")
    expect(body.content.content.map((n: { attrs?: { blockId?: string } }) => n.attrs?.blockId)).toEqual(["b-0000002", "b-0000003"])
    expect(outline(e.state.doc)).toEqual(["paragraph:one", "bulletList:item"])
  })

  it("sends a list item as a list of its kind", async () => {
    post.mockResolvedValue({ data: { ok: true } })
    const e = docEditor(doc)
    const item = posOf(e.state.doc, "item", "listItem")
    e.view.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, item)))
    stageBlockMove("doc-1", e, null)
    await peekBlockMove("doc-1")!.moveTo("doc-2")
    expect(post.mock.calls[0][1].content.content[0].type).toBe("bulletList")
  })

  it("leaves the blocks where a refusal says why", async () => {
    const e = docEditor(doc)
    const before = outline(e.state.doc)
    for (const [res, says] of [
      [{ response: { status: 403 } }, /can't edit that doc/],
      [{ response: { status: 404 } }, /isn't there any more/],
      [new Error("offline"), /couldn't be moved just now/],
    ] as const) {
      post.mockRejectedValueOnce(res)
      stageBlockMove("doc-1", e, range(e, "one"))
      await expect(peekBlockMove("doc-1")!.moveTo("doc-2")).rejects.toThrow(says)
    }
    expect(outline(e.state.doc)).toEqual(before)
  })

  it("says so when the blocks reached the target but couldn't be taken from here", async () => {
    const e = docEditor(doc)
    // Someone deletes them here while the request is on its way.
    post.mockImplementation(async () => {
      e.view.dispatch(e.state.tr.delete(0, e.state.doc.firstChild!.nodeSize))
      return { data: { ok: true } }
    })
    stageBlockMove("doc-1", e, range(e, "one"))
    await expect(peekBlockMove("doc-1")!.moveTo("doc-2")).rejects.toThrow(/still here too/)
  })

  it("won't move blocks into their own doc, or blocks that changed while the dialog was open", async () => {
    const e = docEditor(doc)
    stageBlockMove("doc-1", e, range(e, "one"))
    await expect(peekBlockMove("doc-1")!.moveTo("doc-1")).rejects.toThrow(/in this doc already/)
    stageBlockMove("doc-1", e, range(e, "one"))
    const move = peekBlockMove("doc-1")!
    e.view.dispatch(e.state.tr.delete(0, e.state.doc.firstChild!.nodeSize))
    await expect(move.moveTo("doc-2")).rejects.toThrow(/changed while you chose/)
    expect(post).not.toHaveBeenCalled()
  })
})
