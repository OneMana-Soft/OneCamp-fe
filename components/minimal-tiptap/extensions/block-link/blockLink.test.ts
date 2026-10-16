import { beforeAll, describe, expect, it } from "vitest"
import { blockLinkOf, findBlockById, idOfBlock, jumpToBlock, parseBlockLink } from "./blockLink"
import { blockAt } from "../block-commands/blocks"
import { docEditor, loadDocBlocks, posOf } from "../block-commands/blockTestKit"

beforeAll(loadDocBlocks, 60_000)

// Links to a block (editor.md P1-1, small-details S11, S12): the doc's
// address with the block's id in the fragment and the sender's hue after it.

describe("a link to a block", () => {
  it("is the doc's address, the block's id and the sender's hue", () => {
    expect(blockLinkOf("https://app.example", "d-1", "b-12345678", "sky")).toBe("https://app.example/app/doc/d-1#block-b-12345678~sky")
    expect(blockLinkOf("https://app.example", "d-1", "b-12345678", null)).toBe("https://app.example/app/doc/d-1#block-b-12345678")
  })

  it("is read back, a hue it doesn't know dropped, anything else refused", () => {
    expect(parseBlockLink("#block-b-12345678~sky")).toEqual({ blockId: "b-12345678", hue: "sky" })
    expect(parseBlockLink("block-b-12345678~nope")).toEqual({ blockId: "b-12345678", hue: null })
    expect(parseBlockLink("#block-b-12345678")).toEqual({ blockId: "b-12345678", hue: null })
    for (const bad of ["", "#heading-1", "#block-short", "#block-<script>", "#block-b-12345678~sky~sky"]) expect(parseBlockLink(bad), bad).toBeNull()
  })

  it("names a block by its own id, giving it one first if it has none (outside undo)", () => {
    const e = docEditor('<p data-block-id="b-0000001">one</p><p>two</p>')
    const one = blockAt(e.state.doc, 1)!
    expect(idOfBlock(e, one)).toBe("b-0000001")
    const two = blockAt(e.state.doc, posOf(e.state.doc, "two") + 1)!
    if (!two.node.attrs.blockId) {
      const id = idOfBlock(e, two)!
      expect(id).toBeTruthy()
      expect(findBlockById(e, id)?.node.textContent).toBe("two")
    }
  })

  it("is followed only to a block on the page", () => {
    const e = docEditor('<p data-block-id="b-0000001">one</p>')
    expect(jumpToBlock(e, "b-9999999", null)).toBe(false)
    // jsdom lays nothing out: the block is in the doc but not on a page yet.
    expect(jumpToBlock(e, "b-0000001", null)).toBe(false)
    expect(findBlockById(e, "b-0000001")?.pos).toBe(0)
  })
})
