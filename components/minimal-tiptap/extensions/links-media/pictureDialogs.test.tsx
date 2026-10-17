import * as React from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { Editor, JSONContent } from "@tiptap/core"
import { Slice } from "@tiptap/pm/model"
import { MediaQueryProvider } from "@/context/MediaQueryContext"
import type { ActionContext } from "@/components/docEditor/registry/types"
import { docEditor, loadDocBlocks } from "../block-commands/blockTestKit"
import { blocksWithIds } from "../block-commands/blockIds"
import { runBlockAction } from "./blockActions"
import ImageTextDialog from "./ImageTextDialog"
import CropDialog from "./CropDialog"

// A picture's alt text, link and crop are edited in a dialog while the doc
// stays live. Another person's change can move the picture meanwhile, and
// y-prosemirror brings each one in as the whole doc replaced. What the dialog
// saves goes on the picture it was opened for, wherever that is now, and a
// picture deleted meanwhile says so instead of saving nothing in silence.

const toasts = vi.hoisted(() => [] as Array<{ title?: string; description?: string }>)
vi.mock("@/hooks/use-toast", () => {
  const toast = (t: { title?: string; description?: string }) => void toasts.push(t)
  return { toast, useToast: () => ({ toast }) }
})

beforeAll(() => loadDocBlocks(), 30_000)
afterEach(() => {
  cleanup()
  toasts.length = 0
})

const para = (text: string): JSONContent => ({ type: "paragraph", content: [{ type: "text", text }] })
const picture = (blockId: string): JSONContent => ({ type: "image", attrs: { src: `https://cdn.test/${blockId}.png`, blockId } })

const attrsOf = (editor: Editor, blockId: string) => blocksWithIds(editor.state.doc, [blockId])[0]?.node.attrs

/** Opens a picture's dialog as its block menu does. */
function open(editor: Editor, blockId: string, action: "alt" | "crop", dialog: React.ReactElement) {
  const [at] = blocksWithIds(editor.state.doc, [blockId])
  const bus = { emit: vi.fn() }
  runBlockAction(action, { docId: "doc-1", editor, canEdit: true, bus, state: { range: { from: at.pos, to: at.pos + at.node.nodeSize } } } as unknown as ActionContext)
  expect(bus.emit).toHaveBeenCalledWith("openDialog", { id: action === "crop" ? "media.crop" : "media.text" })
  render(<MediaQueryProvider>{dialog}</MediaQueryProvider>)
}

/** Another person's change, as y-prosemirror brings it in: the whole doc replaced. */
function fromAnotherTab(editor: Editor, change: (blocks: JSONContent[]) => void) {
  const json = editor.getJSON()
  change(json.content!)
  const doc = editor.schema.nodeFromJSON(json)
  act(() => {
    editor.view.dispatch(editor.state.tr.replace(0, editor.state.doc.content.size, new Slice(doc.content, 0, 0)).setMeta("y-sync$", { isChangeOrigin: true }))
  })
}

function saveAltText(text: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Alt text" }), { target: { value: text } })
  fireEvent.submit(document.getElementById("media-text")!)
}

describe("a picture's dialog, while someone else edits the doc", () => {
  it("puts the alt text on the picture after they type above it", () => {
    const editor = docEditor({ type: "doc", content: [para("Launch plan"), picture("b-pic"), para("after")] })
    const onClose = vi.fn()
    open(editor, "b-pic", "alt", <ImageTextDialog docId="doc-1" onClose={onClose} />)
    fromAnotherTab(editor, (blocks) => void (blocks[0].content = [{ type: "text", text: "Launch plan for the spring" }]))
    saveAltText("Five people at a whiteboard")
    expect(attrsOf(editor, "b-pic")?.alt).toBe("Five people at a whiteboard")
    expect(onClose).toHaveBeenCalled()
  })

  it("never puts it on a picture they add above it", () => {
    const editor = docEditor({ type: "doc", content: [para("Launch plan"), picture("b-pic")] })
    open(editor, "b-pic", "alt", <ImageTextDialog docId="doc-1" onClose={() => {}} />)
    fromAnotherTab(editor, (blocks) => void blocks.splice(1, 0, picture("b-theirs")))
    saveAltText("Five people at a whiteboard")
    expect(attrsOf(editor, "b-theirs")?.alt).toBeNull()
    expect(attrsOf(editor, "b-pic")?.alt).toBe("Five people at a whiteboard")
  })

  it("crops the picture after they type above it", () => {
    const editor = docEditor({ type: "doc", content: [para("Launch plan"), picture("b-pic")] })
    open(editor, "b-pic", "crop", <CropDialog docId="doc-1" onClose={() => {}} />)
    fromAnotherTab(editor, (blocks) => void (blocks[0].content = [{ type: "text", text: "Launch plan for the spring" }]))
    // Shift and an arrow make the frame narrower.
    fireEvent.keyDown(screen.getByRole("slider", { name: "Crop frame" }), { key: "ArrowLeft", shiftKey: true })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(attrsOf(editor, "b-pic")?.crop).toBe("0,0,0.99,1")
  })

  it("says the alt text wasn't saved when they deleted the picture", () => {
    const editor = docEditor({ type: "doc", content: [para("Launch plan"), picture("b-pic"), para("after")] })
    const onClose = vi.fn()
    open(editor, "b-pic", "alt", <ImageTextDialog docId="doc-1" onClose={onClose} />)
    fromAnotherTab(editor, (blocks) => void blocks.splice(1, 1))
    const before = JSON.stringify(editor.getJSON())
    saveAltText("Five people at a whiteboard")
    expect(JSON.stringify(editor.getJSON())).toBe(before)
    expect(toasts).toEqual([expect.objectContaining({ title: "Couldn't save the alt text" })])
    expect(onClose).toHaveBeenCalled()
  })
})
