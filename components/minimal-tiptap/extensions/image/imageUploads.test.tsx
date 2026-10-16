import * as React from "react"
import * as Y from "yjs"
import { beforeAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { loadBlocks } from "@/components/docEditor/registry/factory"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import { EditorContent, type Editor } from "@tiptap/react"
import type { HocuspocusProvider } from "@hocuspocus/provider"

import { useDocEditor } from "@/components/docEditor/useDocEditor"
import { offlineProvider } from "@/components/docEditor/docTestKit"
import { MediaQueryProvider } from "@/context/MediaQueryContext"
import { TooltipProvider } from "@/components/ui/tooltip"
import { hasPendingImageUploads, ImageNotUploadable, newUploadId, type ImageUploadOptions } from "./uploads"
import { loadImageView } from "./image"

// The doc's own blocks load once, as the app loads them, before any doc editor is built.
beforeAll(() => loadBlocks("doc", { ai: true }), 30_000)
// The image's view is loaded when a picture first shows (React.lazy): loaded
// here, once, so the first test that shows one doesn't race the module's
// compile against findBy's second (it took 0.6 to 1.3 s on a loaded machine).
beforeAll(() => loadImageView(), 30_000)

// An image used to go into the shared document with a blob: address while it
// uploaded: collaborators got an address only the author's tab could open,
// and a failed upload (or a closed tab) saved it for good. Now the document
// holds only a placeholder (an image with no address and an upload id) until
// the upload finishes, and never a blob: value, at any moment.

vi.mock("@/hooks/useMqttTopic", () => ({ useMqttTopic: () => undefined }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/app/doc/doc-1" }))

const store = configureStore({ reducer: { ui: (s: Record<string, unknown> = {}) => s } })
const providers: HocuspocusProvider[] = []
const tick = (ms = 20) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })

let previews = 0
beforeEach(() => {
  previews = 0
  // jsdom has no object URLs; the browser's look like this.
  URL.createObjectURL = vi.fn(() => `blob:http://localhost/preview-${++previews}`)
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  cleanup()
  while (providers.length) providers.pop()?.destroy()
  document.body.innerHTML = ""
})

/** An upload the test finishes by hand. */
function controlledUpload() {
  const calls: { file: File; options?: ImageUploadOptions; resolve: (v: { id: string; src: string }) => void; reject: (e: unknown) => void }[] = []
  const uploadFn = (file: File, options?: ImageUploadOptions) =>
    new Promise<{ id: string; src: string }>((resolve, reject) => {
      calls.push({ file, options, resolve, reject })
    })
  return { uploadFn, calls }
}

async function mountDoc(uploadFn: (file: File, options?: ImageUploadOptions) => Promise<{ id: string; src: string }>, document?: Y.Doc) {
  const provider = offlineProvider(document)
  providers.push(provider)
  // Everything the shared document ever holds, after every change.
  const seen: string[] = []
  provider.document.on("update", () => seen.push(provider.document.getXmlFragment("default").toString()))
  let editor: Editor | null = null
  function Doc() {
    const e = useDocEditor({
      collaboration: { enabled: true, documentId: "doc-1", username: "Author", userId: "author" },
      provider,
      providerSynced: true,
      uploadFn,
    })
    editor = e as unknown as Editor | null
    return e ? <EditorContent editor={e} /> : null
  }
  render(
    <Provider store={store}>
      <MediaQueryProvider>
        <TooltipProvider>
          <Doc />
        </TooltipProvider>
      </MediaQueryProvider>
    </Provider>,
  )
  await tick()
  expect(editor).toBeTruthy()
  return { editor: editor!, provider, seen }
}

const png = () => new File(["png"], "launch-chart.png", { type: "image/png" })
const imageAttrs = (editor: Editor) => {
  const found: Record<string, unknown>[] = []
  editor.state.doc.descendants((n) => {
    if (n.type.name === "image") found.push(n.attrs)
  })
  return found
}

describe("an image added to a doc", () => {
  it("is a placeholder in the shared document while it uploads, with its progress shown only here", async () => {
    const { uploadFn, calls } = controlledUpload()
    const { editor, seen } = await mountDoc(uploadFn)
    await act(async () => {
      editor.commands.insertImageFiles([png()])
    })
    await tick()

    const [attrs] = imageAttrs(editor)
    expect(attrs.src).toBeNull()
    expect(String(attrs.id)).toMatch(/^up-/)
    expect(attrs.fileName).toBe("launch-chart.png")
    expect(hasPendingImageUploads(editor)).toBe(true)

    // The progress shows on the placeholder, in this tab (its view loads the first time a picture shows).
    await screen.findByRole("progressbar", { name: "Uploading launch-chart.png" })
    act(() => calls[0].options?.onProgress?.(0.5))
    // The placeholder reads the upload from its store once subscribed (a
    // passive effect its node view commits outside act's queue), so the
    // progress is waited for as shown, never read the moment it is sent.
    await screen.findByRole("progressbar", { name: "Uploading launch-chart.png", value: { now: 50 } })

    // Done: the placeholder becomes the image, in one step, keeping its id.
    await act(async () => {
      calls[0].resolve({ id: "obj-1", src: "https://api.example.com/doc/getDocAttachment/doc-1/obj-1" })
    })
    await tick()
    expect(imageAttrs(editor)).toEqual([expect.objectContaining({ id: attrs.id, src: "https://api.example.com/doc/getDocAttachment/doc-1/obj-1" })])
    expect(hasPendingImageUploads(editor)).toBe(false)

    // Never, at any moment, a blob: address in what is shared.
    expect(seen.length).toBeGreaterThan(0)
    for (const state of seen) expect(state).not.toContain("blob:")
    expect(editor.getHTML()).not.toContain("blob:")
  })

  it("says so when the upload fails, and Try again or Remove finish it", async () => {
    const { uploadFn, calls } = controlledUpload()
    const { editor, seen } = await mountDoc(uploadFn)
    await act(async () => {
      editor.commands.insertImageFiles([png(), new File(["2"], "second.png", { type: "image/png" })])
    })
    await tick()
    await act(async () => {
      calls[0].reject(new Error("network"))
      calls[1].reject(new Error("network"))
    })
    await tick()

    const failed = await screen.findAllByRole("group", { name: /didn't upload/ })
    expect(failed).toHaveLength(2)
    expect(failed[0]).toHaveTextContent("Couldn't upload launch-chart.png")
    // A failed upload loses nothing yet, so leaving needn't ask.
    expect(hasPendingImageUploads(editor)).toBe(false)

    // Try again: the same file goes up again, and this time it lands.
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Try again" })[0])
    })
    expect(calls).toHaveLength(3)
    expect(calls[2].file.name).toBe("launch-chart.png")
    await act(async () => {
      calls[2].resolve({ id: "obj-1", src: "https://api.example.com/a.png" })
    })
    await tick()

    // Remove: the other placeholder leaves the document.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove" }))
    })
    await tick()
    expect(imageAttrs(editor)).toEqual([expect.objectContaining({ src: "https://api.example.com/a.png" })])
    for (const state of seen) expect(state).not.toContain("blob:")
  })

  it("drops the placeholder of a file that can never upload (over the limit)", async () => {
    const { editor } = await mountDoc(async () => {
      throw new ImageNotUploadable("too large")
    })
    await act(async () => {
      editor.commands.insertImageFiles([png()])
    })
    await tick()
    expect(imageAttrs(editor)).toEqual([])
  })

  it("shows a collaborator 'Uploading…', then 'didn't finish' for an upload that never landed", async () => {
    const shared = new Y.Doc()
    const { editor: theirs } = await mountDoc(async () => new Promise(() => {}), shared)
    await act(async () => {
      theirs.commands.insertImageFiles([png()])
      // And an old placeholder, abandoned when its author's tab closed.
      theirs.commands.insertContent({ type: "image", attrs: { id: newUploadId(Date.now() - 60 * 60_000), src: null, fileName: "old.png" } })
    })
    await tick()
    cleanup()

    // Another member's copy of the same document: no local upload for either.
    const mine = new Y.Doc()
    Y.applyUpdate(mine, Y.encodeStateAsUpdate(shared))
    const { editor } = await mountDoc(async () => ({ id: "x", src: "https://x" }), mine)
    expect(imageAttrs(editor)).toHaveLength(2)
    expect(screen.getByRole("status")).toHaveTextContent("Uploading launch-chart.png…")
    expect(screen.getByText("This image didn't finish uploading.")).toBeInTheDocument()
    expect(document.body.innerHTML).not.toContain("blob:")
  })

  it("treats an old document's blob: image as one that never finished, never uploading it again", async () => {
    const upload = vi.fn()
    const { editor } = await mountDoc(upload)
    await act(async () => {
      editor.commands.insertContent({ type: "image", attrs: { id: "img-1", src: "blob:http://elsewhere/abc", fileName: "lost.png" } })
    })
    await tick()
    expect(screen.getByText("This image didn't finish uploading.")).toBeInTheDocument()
    expect(upload).not.toHaveBeenCalled()
  })
})
