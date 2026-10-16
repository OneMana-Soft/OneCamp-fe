import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { Editor, type JSONContent } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { Slice } from "@tiptap/pm/model"
import { answerContent, docMarkdown, loadCodec, isInlineRange, markdownBefore, plainOf, rangeMarkdown, textAround, wholeLines, writePlace } from "./docAIContent"
import { BLOCK_ID_ATTR, BlockId } from "@/components/minimal-tiptap/extensions/block-id"

// Doc AI's text in and out (ai-search-io P0-3, N17): Markdown from the live
// editor, and an answer back as the editor's own blocks.

// The codec loads once, before the clock matters (a cold cache takes seconds).
beforeAll(() => loadCodec(), 60_000)

let editor: Editor
beforeEach(() => {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit, BlockId],
    content: "<h2>Plan</h2><p>We ship on <strong>Friday</strong>.</p><ul><li><p>tell sales</p></li></ul><p></p>",
  })
})
afterEach(() => editor.destroy())

/** Positions of the blocks, in order: [from, to] of each. */
const blocks = () => {
  const out: Array<[number, number]> = []
  editor.state.doc.forEach((node, offset) => {
    out.push([offset, offset + node.nodeSize])
  })
  return out
}

describe("what an action reads", () => {
  it("is Markdown of the range, as the doc's codec writes it", async () => {
    const [heading, para] = blocks()
    expect(await rangeMarkdown(editor, heading[0], para[1])).toBe("## Plan\n\nWe ship on **Friday**.")
    expect(await docMarkdown(editor)).toContain("- tell sales")
    expect(await markdownBefore(editor, para[1])).toBe("## Plan\n\nWe ship on **Friday**.")
  })

  it("keeps only the end of a long doc before the caret", async () => {
    const md = await markdownBefore(editor, editor.state.doc.content.size, 20)
    expect(md.length).toBeLessThanOrEqual(20)
    expect(md).toContain("tell sales")
  })

  it("gives the text around a range, plain, for tone only", () => {
    const [, para] = blocks()
    expect(textAround(editor.state, para[0] + 1, para[0] + 3)).toContain("Plan")
  })
})

describe("where an answer goes", () => {
  it("fills the empty line it was asked on, or goes after the caret's block", () => {
    const [, para, , empty] = blocks()
    expect(writePlace(editor.state, empty[0] + 1, empty[0] + 1)).toEqual({ from: empty[0], to: empty[1] })
    expect(writePlace(editor.state, para[0] + 3, para[0] + 3)).toEqual({ from: para[1], to: para[1] })
  })

  it("takes whole lines as their blocks, and leaves part of a line, or a list, as it is", () => {
    const [heading, para, list] = blocks()
    expect(wholeLines(editor.state, para[0] + 1, para[1] - 1)).toEqual({ from: para[0], to: para[1] })
    expect(wholeLines(editor.state, heading[0] + 1, para[1] - 1)).toEqual({ from: heading[0], to: para[1] })
    expect(wholeLines(editor.state, para[0] + 2, para[1] - 1)).toEqual({ from: para[0] + 2, to: para[1] - 1 })
    expect(wholeLines(editor.state, list[0] + 3, list[1] - 3)).toEqual({ from: list[0] + 3, to: list[1] - 3 })
  })

  it("stays inline only inside one line of text", () => {
    const [heading, para] = blocks()
    expect(isInlineRange(editor.state, para[0] + 1, para[0] + 5)).toBe(true)
    expect(isInlineRange(editor.state, heading[0] + 1, para[0] + 3)).toBe(false)
    expect(isInlineRange(editor.state, para[0] + 1, para[0] + 1)).toBe(false)
  })
})

describe("an answer in the doc (N17)", () => {
  it("becomes headings, lists and marks, never one flat paragraph with literal Markdown", async () => {
    const content = (await answerContent(editor.state, "## Rollout\n\n- **Monday**: freeze\n- Tuesday: ship", false)) as JSONContent[]
    expect(content.map((b) => b.type)).toEqual(["heading", "bulletList"])
    expect(JSON.stringify(content)).toContain('"bold"')
    expect(JSON.stringify(content)).not.toContain("**")
  })

  it("comes with an id for every block, so nothing is added to it after it goes in", async () => {
    const content = (await answerContent(editor.state, "## Rollout\n\n- Freeze\n- Ship", false)) as JSONContent[]
    const ids: string[] = []
    const walk = (n: JSONContent) => {
      if (n.type !== "text") ids.push(String(n.attrs?.[BLOCK_ID_ATTR] ?? ""))
      n.content?.forEach(walk)
    }
    content.forEach(walk)
    // heading; list; two items, each with its paragraph
    expect(ids).toHaveLength(6)
    expect(ids.every((id) => /^[0-9a-f-]{36}$/.test(id))).toBe(true)
    expect(new Set(ids).size).toBe(6)
  })

  it("keeps a one-line answer for a selection inside a line as that line's words", async () => {
    const slice = await answerContent(editor.state, "We ship on *Thursday*.", true)
    expect(slice).toBeInstanceOf(Slice)
    expect((slice as Slice).content.textBetween(0, (slice as Slice).content.size)).toBe("We ship on Thursday.")
    // A list stays a block, even for an inline selection.
    expect(Array.isArray(await answerContent(editor.state, "- one\n- two", true))).toBe(true)
  })

  it("is fingerprinted by its plain text, never kept", () => {
    expect(plainOf(editor.state, [{ type: "paragraph", content: [{ type: "text", text: "a" }] }, { type: "paragraph" }])).toBe("a\n")
  })
})
