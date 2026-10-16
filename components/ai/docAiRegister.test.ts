import { afterEach, describe, expect, it, vi } from "vitest"
import { Editor } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"

import "@/components/docEditor/registry"
import { attachBus, createDocCommandBus } from "@/components/docEditor/registry/commandBus"
import { slashItemsFor } from "@/components/docEditor/registry/readers"
import { aiBarOf } from "./docAiStore"

// Doc AI's "/" items open the bar of the editor they were typed in (I17): in
// split view, one doc's two editors each have their own.

const editors: Editor[] = []
const offs: Array<() => void> = []
afterEach(() => {
  while (offs.length) offs.pop()?.()
  while (editors.length) editors.pop()?.destroy()
})

function docEditor(docId: string) {
  const editor = new Editor({ element: document.createElement("div"), extensions: [StarterKit], content: "<p>start</p>" })
  editors.push(editor)
  offs.push(attachBus(editor, createDocCommandBus(docId)))
  return editor
}

describe('"/" Write with AI', () => {
  it("opens the bar in the editor it was typed in, not in every doc", async () => {
    const left = docEditor("doc-1")
    const right = docEditor("doc-1")
    const write = slashItemsFor("doc", { ai: true }).find((i) => i.id === "ai-write")!
    write.command({ editor: right, range: { from: 1, to: 1 } })
    await vi.waitFor(() => expect(aiBarOf(right).open).toBe(true))
    expect(aiBarOf(right).request).toMatchObject({ docId: "doc-1", source: "slash" })
    expect(aiBarOf(left).open).toBe(false)
  })
})
