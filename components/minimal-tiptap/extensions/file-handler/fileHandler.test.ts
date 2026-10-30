import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest"
import { Editor } from "@tiptap/react"
import { StarterKit } from "@tiptap/starter-kit"
import type { EditorView } from "@tiptap/pm/view"
import { FileHandler } from "./index"

// A paste or a drop that carries files is handled once, and said to be: a
// handler that answered "not handled" let ProseMirror paste the clipboard's
// HTML as a second image, or run the paste again through its own capture, so
// one picture was stored twice (the 22 Oct demo smoke).

const png = () => new File([new Uint8Array([137, 80, 78, 71])], "shot.png", { type: "image/png" })

/** A DataTransfer as a browser fills one: files, and text in any formats. */
function transfer(files: File[], data: Record<string, string> = {}): DataTransfer {
  return {
    files: Object.assign([...files], { item: (i: number) => files[i] ?? null }) as unknown as FileList,
    getData: (format: string) => data[format] ?? "",
  } as unknown as DataTransfer
}

function setup() {
  const onPaste = vi.fn()
  const onDrop = vi.fn()
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit, FileHandler.configure({ allowBase64: true, allowedMimeTypes: [], maxFileSize: 0, onPaste, onDrop })],
    content: "<p></p>",
  })
  const plugin = editor.state.plugins.find((p) => (p as unknown as { key: string }).key.startsWith("fileHandler"))!
  const view = editor.view as EditorView
  const paste = (data: DataTransfer) => {
    const event = { clipboardData: data, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as ClipboardEvent
    return { handled: plugin.props.handlePaste!.call(plugin, view, event, undefined as never), event }
  }
  const drop = (data: DataTransfer) => {
    const event = { dataTransfer: data, clientX: 0, clientY: 0, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as DragEvent
    return { handled: plugin.props.handleDrop!.call(plugin, view, event, undefined as never, false), event }
  }
  return { editor, onPaste, onDrop, paste, drop }
}

let editor: Editor | null = null
afterEach(() => {
  editor?.destroy()
  editor = null
})

describe("the file handler", () => {
  it("handles a pasted picture once, and says so", () => {
    const s = setup()
    editor = s.editor
    const { handled } = s.paste(transfer([png()]))
    expect(handled).toBe(true)
    expect(s.onPaste).toHaveBeenCalledTimes(1)
  })

  it("handles a picture copied from a web page (an <img> beside the file) as the file alone", () => {
    const s = setup()
    editor = s.editor
    const { handled } = s.paste(transfer([png()], { "text/html": '<meta charset="utf-8"><img src="https://example.com/shot.png">' }))
    expect(handled).toBe(true)
    expect(s.onPaste).toHaveBeenCalledTimes(1)
  })

  it("leaves a page copied from Word (its text, and a picture of it) to the editor, untouched", () => {
    const s = setup()
    editor = s.editor
    const { handled, event } = s.paste(transfer([png()], { "text/html": "<p>Quarterly plan</p><img src=\"cid:1\">" }))
    expect(handled).toBe(false)
    expect(s.onPaste).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it("leaves a plain text paste to the editor, untouched", () => {
    const s = setup()
    editor = s.editor
    const { handled, event } = s.paste(transfer([], { "text/plain": "hello" }))
    expect(handled).toBe(false)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.stopPropagation).not.toHaveBeenCalled()
  })

  it("handles dropped files once, and leaves a drop without files (a block moved in the doc) to the editor", () => {
    // jsdom has no elementFromPoint, which ProseMirror's posAtCoords asks.
    Object.defineProperty(document, "elementFromPoint", { value: () => null, configurable: true })
    onTestFinished(() => {
      delete (document as { elementFromPoint?: unknown }).elementFromPoint
    })
    const s = setup()
    editor = s.editor
    expect(s.drop(transfer([png()])).handled).toBe(true)
    expect(s.onDrop).toHaveBeenCalledTimes(1)
    const inside = s.drop(transfer([], { "text/html": "<p>moved</p>" }))
    expect(inside.handled).toBe(false)
    expect(inside.event.preventDefault).not.toHaveBeenCalled()
  })
})
