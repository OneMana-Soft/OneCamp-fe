import * as React from "react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { Editor } from "@tiptap/core"
import type { NodeViewProps } from "@tiptap/react"
import { docEditor, loadDocBlocks } from "../block-commands/blockTestKit"
import { ImagePlaceholder } from "./components/image-placeholder"
import { findImageById, imageUploadsOf, placeholderContent, runImageUpload } from "./uploads"

// A doc's picture upload says nothing in a toast (useUploadFile's OWN_ERRORS):
// the picture says it failed, with Try again and Remove. So the picture is the
// one place the reason can be read, and it must be the reason the server gave:
// "check your connection" sends someone to retry a file the server refuses.

beforeAll(() => loadDocBlocks(), 30_000)
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:http://localhost/preview")
  URL.revokeObjectURL = vi.fn()
})
afterEach(cleanup)

/** A picture whose upload ended in this error, as its placeholder draws it. */
async function failedWith(error: unknown): Promise<Editor> {
  const editor = docEditor("<p>Launch plan</p>")
  const upload = imageUploadsOf(editor)!.add(new File(["png"], "launch-chart.png", { type: "image/png" }))
  editor.commands.insertContentAt(editor.state.doc.content.size, placeholderContent(upload))
  await runImageUpload(editor, upload.id, async () => {
    throw error
  })
  const { node } = findImageById(editor.state.doc, upload.id)!
  render(<ImagePlaceholder {...({ editor, node, selected: false, deleteNode: () => {} } as unknown as NodeViewProps)} />)
  return editor
}

/** What the picture says about its failure, and how it's said (its role). */
function saying(): { words: string | null; role: string | null } {
  const p = screen.getByText(/^Couldn't upload launch-chart\.png\./)
  return { words: p.textContent, role: p.getAttribute("role") }
}

describe("a picture whose upload failed", () => {
  it("says the reason the server gave, out loud", async () => {
    await failedWith({ isAxiosError: true, message: "Request failed with status code 415", response: { status: 415, data: { msg: "Pictures in that format can't be added here." } } })
    expect(saying()).toEqual({ words: "Couldn't upload launch-chart.png. Pictures in that format can't be added here.", role: "alert" })
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy()
  })

  it("asks for the connection to be checked when the server wasn't reached", async () => {
    await failedWith(Object.assign(new Error("Network Error"), { isAxiosError: true }))
    expect(saying()).toEqual({ words: "Couldn't upload launch-chart.png. Check your connection and try again.", role: "alert" })
  })

  it("never shows a fault's own words", async () => {
    await failedWith(new Error("the upload returned no address"))
    expect(saying()).toEqual({ words: "Couldn't upload launch-chart.png. Check your connection and try again.", role: "alert" })
  })
})
