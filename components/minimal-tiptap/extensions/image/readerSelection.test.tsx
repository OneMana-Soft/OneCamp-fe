import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import { Editor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { Image } from "./image"

// DESIGN-BUILD-10's M3 (24 Oct): every GIF someone sent wore the editor's
// orange selection outline, its foot clipped, on a phone and a computer
// alike. A message is a read-only editor, and a GIF sent from the box is the
// picture alone, so its editor opens with the picture selected.

const GIF = "https://media.giphy.com/media/abc/giphy.gif"
let editor: Editor | undefined

afterEach(() => {
  cleanup()
  editor?.destroy()
  editor = undefined
})

async function picture(editable: boolean) {
  editor = new Editor({ extensions: [StarterKit, Image], editable, content: `<img src="${GIF}">` })
  const { container } = render(<EditorContent editor={editor} />)
  const img = await waitFor(() => {
    const found = container.querySelector<HTMLImageElement>(`img[src="${GIF}"]`)
    if (!found) throw new Error("the picture hasn't rendered")
    return found
  }, { timeout: 5000 })
  return img.closest<HTMLElement>("[data-node-view-wrapper]")!
}

describe("a picture in a message", () => {
  it("isn't drawn selected where nobody can edit it", async () => {
    const view = await picture(false)
    expect(editor!.state.selection.toJSON().type).toBe("node")
    expect(view.querySelector(".outline-brand")).toBeNull()
  })

  it("is drawn selected while its box is edited", async () => {
    const view = await picture(true)
    act(() => void editor!.commands.setNodeSelection(0))
    await waitFor(() => expect(view.querySelector(".outline-brand")).not.toBeNull())
  })
})
