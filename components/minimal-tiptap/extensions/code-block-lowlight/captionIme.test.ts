import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { fireEvent } from "@testing-library/react"
import { Editor } from "@tiptap/core"
import { installRangeRects } from "@/lib/testing/rangeRects"
import "@/components/docEditor/registry"
import { extensionsFor, loadBlocks } from "@/components/docEditor/registry/factory"
import { ALL_EDITIONS, bareContext } from "@/components/docEditor/registry/manifest"

// A code block's caption is typed in its own field, outside ProseMirror, so
// ProseMirror's own guard for an input method (Japanese, Chinese, Korean) is
// not in front of it: the Enter that picks a word, and the Escape that drops
// a word being made, must not store or throw away the caption.

beforeAll(() => loadBlocks("doc", ALL_EDITIONS), 30_000)
let restoreRects = () => {}
beforeAll(() => {
  restoreRects = installRangeRects()
})
afterAll(() => restoreRects())

const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()!.destroy()
  document.body.innerHTML = ""
})

function captionField() {
  const el = document.body.appendChild(document.createElement("div"))
  const editor = new Editor({ element: el, extensions: extensionsFor(bareContext("doc")), content: "<pre><code>x</code></pre>" })
  editors.push(editor)
  ;(editor.view.dom.querySelector('.doc-code-bar [aria-label="Add a caption"]') as HTMLButtonElement).click()
  const input = editor.view.dom.querySelector(".doc-code-caption input") as HTMLInputElement
  input.value = "東京"
  const caption = () => editor.getJSON().content![0].attrs?.caption ?? null
  return { editor, input, caption }
}

describe("a code block's caption, typed through an input method", () => {
  it("keeps the field open on the Enter that picks a word", () => {
    const { input, caption } = captionField()
    fireEvent.keyDown(input, { key: "Enter", isComposing: true })
    expect(caption()).toBeNull()
    expect(input.isConnected).toBe(true)
    expect(document.activeElement).toBe(input)
  })

  it("keeps it open on Safari's, which says keyCode 229 and not isComposing", () => {
    const { input, caption } = captionField()
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 })
    expect(caption()).toBeNull()
    expect(input.isConnected).toBe(true)
  })

  it("keeps what's typed when Escape drops the word being made", () => {
    const { input, caption } = captionField()
    fireEvent.keyDown(input, { key: "Escape", isComposing: true })
    expect(input.isConnected).toBe(true)
    // The word is done: Enter stores it.
    fireEvent.keyDown(input, { key: "Enter" })
    expect(caption()).toBe("東京")
  })
})
