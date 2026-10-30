import { beforeAll, describe, expect, it } from "vitest"
import type { Editor } from "@tiptap/core"
import { docEditor, loadDocBlocks } from "@/components/minimal-tiptap/extensions/block-commands/blockTestKit"
import type { BlockRef } from "@/components/minimal-tiptap/extensions/block-commands/blocks"
import { chosenLabel } from "./blockMenuRows"

const GATE = { ai: false }

beforeAll(async () => {
  await loadDocBlocks()
}, 60_000)

/** The first block of this type in the doc, as the block menu holds it. */
function first(editor: Editor, type: string): BlockRef {
  let found: BlockRef | null = null
  editor.state.doc.descendants((node, pos) => {
    if (!found && node.type.name === type) found = { node, pos }
    return !found
  })
  if (!found) throw new Error(`no ${type} in the doc`)
  return found
}

describe("the name of what the block menu holds", () => {
  it("names a page's block a page, and an image an image, not the text the caret was last in", () => {
    const editor = docEditor(`<p>One</p><div data-type="subpage" data-doc-id="c4110000-0000-4000-8000-0000000000c1"></div><img src="https://example.com/a.png">`)
    expect(chosenLabel(editor, [first(editor, "subpage")], GATE)).toBe("Page")
    expect(chosenLabel(editor, [first(editor, "image")], GATE)).toBe("Image")
  })

  it("names a text block by what Turn into calls it, and many blocks by their count", () => {
    const editor = docEditor("<h2>Plan</h2><p>One</p>")
    editor.commands.setTextSelection(2)
    const heading = first(editor, "heading")
    expect(chosenLabel(editor, [heading], GATE)).toBe("Heading 2")
    expect(chosenLabel(editor, [heading, first(editor, "paragraph")], GATE)).toBe("2 blocks")
  })
})
