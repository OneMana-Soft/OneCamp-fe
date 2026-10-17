import * as React from "react"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { installRangeRects } from "@/lib/testing/rangeRects"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import { EditorContent, type Editor } from "@tiptap/react"
import { TextSelection } from "@tiptap/pm/state"
import { Slice } from "@tiptap/pm/model"
import type { HocuspocusProvider } from "@hocuspocus/provider"

import { loadBlocks } from "@/components/docEditor/registry/factory"
import { useDocEditor } from "@/components/docEditor/useDocEditor"
import { offlineProvider } from "@/components/docEditor/docTestKit"
import { MediaQueryProvider } from "@/context/MediaQueryContext"
import { TooltipProvider } from "@/components/ui/tooltip"
import { GuestReaderContext } from "@/components/minimal-tiptap/guestReader"
import { LinkBubbleMenu } from "@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu"
import { setUploadLimit } from "../file-block/uploadLimit"
import { hasPendingImageUploads, type ImageUploadOptions } from "../image/uploads"
import PasteMenu from "./PasteMenu"

// Docs B4's blocks as people see them: bookmarks, embeds, files, link
// mentions, the paste menu and the link bar.

beforeAll(() => loadBlocks("doc", { ai: true }), 30_000)

// jsdom measures no text: ProseMirror's coordsAtPos asks a range for its
// boxes, here one box for every range (lib/testing/rangeRects).
let restoreRects = () => {}
beforeAll(() => {
  restoreRects = installRangeRects({ x: 10, y: 10, width: 50, height: 16 })
})
afterAll(() => restoreRects())

vi.mock("@/hooks/useMqttTopic", () => ({ useMqttTopic: () => undefined }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/app/doc/doc-1" }))
const toasts = vi.hoisted(() => [] as Array<{ title?: string; description?: string }>)
vi.mock("@/hooks/use-toast", () => {
  const toast = (t: { title?: string; description?: string }) => void toasts.push(t)
  // One toast, always the same: the editor's blocks are rebuilt when it changes.
  const hook = { toast }
  return { toast, useToast: () => hook }
})
vi.mock("@/services/unfurlService", () => ({
  unfurlLink: vi.fn(async (url: string) => ({ url, fetched: false })),
  storeFromLink: vi.fn(),
  adminEmbedHosts: vi.fn(async () => []),
}))

const store = configureStore({ reducer: { ui: (s: Record<string, unknown> = {}) => s } })
const providers: HocuspocusProvider[] = []
const tick = (ms = 30) => act(async () => void (await new Promise((r) => setTimeout(r, ms))))

beforeEach(() => {
  toasts.length = 0
  URL.createObjectURL = vi.fn(() => "blob:http://localhost/preview")
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  cleanup()
  while (providers.length) providers.pop()?.destroy()
  setUploadLimit(null)
  document.body.innerHTML = ""
})

async function mountDoc(opts: { editable?: boolean; guest?: boolean; uploadFn?: (f: File, o?: ImageUploadOptions) => Promise<{ id: string; src: string }>; extra?: (e: Editor) => React.ReactNode } = {}): Promise<Editor> {
  const provider = offlineProvider()
  providers.push(provider)
  let editor: Editor | null = null
  function Doc() {
    const e = useDocEditor({
      collaboration: { enabled: true, documentId: "doc-1", username: "Sam", userId: "sam" },
      provider,
      editable: opts.editable !== false,
      guest: opts.guest,
      uploadFn: opts.uploadFn,
    })
    editor = e as unknown as Editor | null
    return e ? (
      <>
        <EditorContent editor={e} />
        {opts.extra?.(e as unknown as Editor)}
      </>
    ) : null
  }
  render(
    <Provider store={store}>
      <MediaQueryProvider>
        <TooltipProvider>
          <GuestReaderContext.Provider value={!!opts.guest}>
            <Doc />
          </GuestReaderContext.Provider>
        </TooltipProvider>
      </MediaQueryProvider>
    </Provider>,
  )
  await vi.waitFor(() => expect(editor).not.toBeNull(), { timeout: 10_000 })
  return editor!
}

const set = (editor: Editor, content: object[]) => act(() => void editor.commands.setContent({ type: "doc", content }))

describe("a bookmark", () => {
  it("shows the page's title, words and site, and is the link, in a new tab", async () => {
    const editor = await mountDoc()
    set(editor, [{ type: "bookmark", attrs: { href: "https://onemana.dev/blog/launch", title: "Launch notes", description: "What we shipped", siteName: "OneMana" } }])
    const card = await screen.findByRole("link", { name: /Launch notes/ })
    expect(card).toHaveAttribute("href", "https://onemana.dev/blog/launch")
    expect(card).toHaveAttribute("target", "_blank")
    expect(card.getAttribute("rel")).toMatch(/noopener/)
    expect(card).toHaveTextContent("What we shipped")
    expect(card).toHaveTextContent("OneMana")
  })

  it("with no link yet, asks for one", async () => {
    const editor = await mountDoc()
    set(editor, [{ type: "bookmark" }])
    const field = await screen.findByRole("textbox", { name: "Paste a link to make a bookmark" })
    fireEvent.change(field, { target: { value: "not a link" } })
    fireEvent.click(screen.getByRole("button", { name: "Make bookmark" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Give a link that starts with http:// or https://.")
  })

  it("draws only pictures kept with the doc: one from anywhere else would tell that site who reads it", async () => {
    const editor = await mountDoc()
    const kept = "https://api.example.test/doc/getDocAttachment/6f0c2b1e-3d4a-4b5c-8d6e-7f8091a2b3c4/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"
    set(editor, [
      { type: "bookmark", attrs: { href: "https://example.com/", title: "Example", icon: "https://tracker.example/pixel.png", image: kept } },
      { type: "paragraph", content: [{ type: "linkMention", attrs: { href: "https://example.com/b", title: "Brief", icon: "https://tracker.example/b.png" } }] },
    ])
    await screen.findByRole("link", { name: /Example/ })
    await screen.findByRole("link", { name: "Brief" })
    // (ProseMirror's own separator after an inline node is an img with no address.)
    expect(Array.from(document.querySelectorAll("img[src]")).map((i) => i.getAttribute("src"))).toEqual([kept])
  })

  it("loads a guest's icon through their link", async () => {
    window.history.pushState({}, "", "/guest/d/tok")
    const doc = "6f0c2b1e-3d4a-4b5c-8d6e-7f8091a2b3c4"
    const editor = await mountDoc({ editable: false, guest: true })
    set(editor, [{ type: "bookmark", attrs: { href: "https://example.com/", title: "Example", icon: `https://api.example.test/doc/getDocAttachment/${doc}/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d` } }])
    await screen.findByRole("link", { name: /Example/ })
    expect(document.querySelector("img")?.getAttribute("src")).toMatch(/\/guest\/doc-attachment\/tok\/0a1b2c3d-/)
    window.history.pushState({}, "", "/")
  })
})

describe("an embed", () => {
  it("frames YouTube's own player, sandboxed, with the origin as its only referrer", async () => {
    const editor = await mountDoc()
    set(editor, [{ type: "webEmbed", attrs: { src: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } }])
    const frame = await screen.findByTitle("YouTube embed")
    expect(frame.getAttribute("src")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0")
    expect(frame.getAttribute("sandbox")).not.toMatch(/allow-top-navigation/)
    expect(frame.getAttribute("referrerpolicy")).toBe("strict-origin")
  })

  it("never frames a site no one allowed, and offers a bookmark instead", async () => {
    const editor = await mountDoc()
    set(editor, [{ type: "webEmbed", attrs: { src: "https://example.com/page" } }])
    expect(await screen.findByText(/This link can't be shown here/)).toBeInTheDocument()
    expect(document.querySelector("iframe")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Make it a bookmark" }))
    expect(editor.getJSON().content?.[0]).toMatchObject({ type: "bookmark", attrs: { href: "https://example.com/page" } })
  })

  it("with no link yet, says what can be embedded, and why a site can't", async () => {
    const editor = await mountDoc()
    set(editor, [{ type: "webEmbed" }])
    const field = await screen.findByRole("textbox", { name: "Paste a link to embed" })
    fireEvent.change(field, { target: { value: "https://example.com/x" } })
    fireEvent.click(screen.getByRole("button", { name: "Embed" }))
    expect(screen.getByRole("alert")).toHaveTextContent("That site can't be shown in a doc.")
    fireEvent.change(field, { target: { value: "https://vimeo.com/76979871" } })
    fireEvent.click(screen.getByRole("button", { name: "Embed" }))
    expect(editor.getJSON().content?.[0]).toMatchObject({ type: "webEmbed", attrs: { src: "https://vimeo.com/76979871" } })
  })
})

describe("a file", () => {
  const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type })

  it("uploads with its progress, and a failure offers Try again", { timeout: 30_000 }, async () => {
    const calls: Array<{ resolve: (v: { id: string; src: string }) => void; reject: (e: unknown) => void; options?: ImageUploadOptions }> = []
    const uploadFn = (_f: File, options?: ImageUploadOptions) => new Promise<{ id: string; src: string }>((resolve, reject) => void calls.push({ resolve, reject, options }))
    const editor = await mountDoc({ uploadFn })
    await act(async () => void editor.commands.insertFileBlocks([file("plan.pdf", "application/pdf", 2048)]))
    await tick()
    expect(editor.getJSON().content?.[0]).toMatchObject({ type: "fileBlock", attrs: { kind: "pdf", name: "plan.pdf", size: 2048, src: null } })
    const bar = await screen.findByRole("progressbar", { name: "Uploading plan.pdf" }, { timeout: 10_000 })
    act(() => calls[0].options?.onProgress?.(0.5))
    expect(bar).toHaveAttribute("aria-valuenow", "50")
    await act(async () => calls[0].reject(new Error("network")))
    await tick()
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't upload it")
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    await act(async () => calls[1].resolve({ id: "obj-1", src: "https://api.example.test/doc/getDocAttachment/d/obj-1" }))
    await tick()
    expect(editor.getJSON().content?.[0].attrs?.src).toBe("https://api.example.test/doc/getDocAttachment/d/obj-1")
  })

  it("keeps each editor's uploads its own: the block is one instance for every editor (Tiptap 2 gives it one storage)", { timeout: 30_000 }, async () => {
    const uploadFn = () => new Promise<{ id: string; src: string }>(() => {})
    const left = await mountDoc({ uploadFn })
    cleanup() // the doc is left: Tiptap destroys its editor a moment later
    const editor = await mountDoc({ uploadFn })
    await act(async () => void editor.commands.insertFileBlocks([file("plan.pdf", "application/pdf", 2048)]))
    await vi.waitFor(() => expect(left.isDestroyed).toBe(true))
    expect(await screen.findByRole("progressbar", { name: "Uploading plan.pdf" }, { timeout: 10_000 })).toBeInTheDocument()
    expect(hasPendingImageUploads(editor)).toBe(true)
    expect(hasPendingImageUploads(left)).toBe(false)
  })

  it("dropped on a line, lands after it, never splitting it", { timeout: 30_000 }, async () => {
    const uploadFn = () => new Promise<{ id: string; src: string }>(() => {})
    const editor = await mountDoc({ uploadFn })
    set(editor, [
      { type: "paragraph", content: [{ type: "text", text: "Paste a link here:" }] },
      { type: "paragraph", content: [{ type: "text", text: "after" }] },
    ])
    // jsdom lays nothing out: the drop is at the fourth character of the first line.
    editor.view.posAtCoords = () => ({ pos: 4, inside: -1 })
    const event = { preventDefault() {}, stopPropagation() {}, clientX: 0, clientY: 0, dataTransfer: { files: [file("plan.pdf", "application/pdf", 2048)] } } as unknown as DragEvent
    act(() => void editor.view.someProp("handleDrop", (f) => f(editor.view, event, Slice.empty, false)))
    expect(editor.getJSON().content?.map((n) => n.type)).toEqual(["paragraph", "fileBlock", "paragraph"])
    expect(editor.getJSON().content?.[0].content?.[0].text).toBe("Paste a link here:")
  })

  it("is refused before it is sent when it is over the workspace's limit (N27)", async () => {
    const uploadFn = vi.fn()
    const editor = await mountDoc({ uploadFn })
    setUploadLimit({ bytes: 100, mb: 0.0001 })
    await act(async () => void editor.commands.insertFileBlocks([file("big.mov", "video/quicktime", 500)]))
    expect(uploadFn).not.toHaveBeenCalled()
    expect(editor.getJSON().content?.some((n) => n.type === "fileBlock")).toBe(false)
    expect(toasts.at(-1)).toMatchObject({ title: "File too large" })
    expect(toasts.at(-1)?.description).toMatch(/big\.mov is 500 B, over the/)
  })

  it("treats an address that isn't safe to follow as no file", async () => {
    const editor = await mountDoc()
    set(editor, [{ type: "fileBlock", attrs: { kind: "pdf", src: "javascript:alert(1)", name: "plan.pdf", id: "f-1" } }])
    expect(await screen.findByText("This file didn't finish uploading.")).toBeInTheDocument()
    expect(document.querySelector('a[href^="javascript"]')).toBeNull()
  })

  it("plays a video, and shows any other file with its name, size and a download", async () => {
    const editor = await mountDoc()
    set(editor, [
      { type: "fileBlock", attrs: { kind: "video", src: "https://api.example.test/doc/getDocAttachment/d/v", name: "demo.mp4", mime: "video/mp4" } },
      { type: "fileBlock", attrs: { kind: "file", src: "https://api.example.test/doc/getDocAttachment/d/f", name: "rows.csv", size: 2048, mime: "text/csv" } },
    ])
    await vi.waitFor(() => expect(document.querySelector("video")).not.toBeNull())
    expect(document.querySelector("video")).toHaveAttribute("src", "https://api.example.test/doc/getDocAttachment/d/v")
    expect(await screen.findByText("rows.csv")).toBeInTheDocument()
    expect(screen.getByText("2.0 KB")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Download rows.csv" })).toBeInTheDocument()
  })
})

describe("a link mention", () => {
  it("is the page's title in a chip, opening the page in a new tab", async () => {
    const editor = await mountDoc()
    set(editor, [{ type: "paragraph", content: [{ type: "text", text: "See " }, { type: "linkMention", attrs: { href: "https://example.com/brief", title: "The brief" } }] }])
    const chip = await screen.findByRole("link", { name: /The brief/ })
    expect(chip).toHaveAttribute("href", "https://example.com/brief")
    expect(chip).toHaveAttribute("target", "_blank")
  })
})

describe("the paste menu", () => {
  const paste = (editor: Editor, text: string) =>
    act(() => {
      const clipboardData = { types: ["text/plain"], files: [], getData: (t: string) => (t === "text/plain" ? text : "") }
      editor.view.someProp("handlePaste", (f) => f(editor.view, { clipboardData, preventDefault() {}, stopPropagation() {} } as unknown as ClipboardEvent, Slice.empty))
    })

  it("offers Link first, then Mention and Bookmark, and Embed for a site the doc frames", async () => {
    const editor = await mountDoc({ extra: (e) => <PasteMenu editor={e} /> })
    paste(editor, "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    const list = await screen.findByRole("listbox", { name: "Paste as" })
    const options = screen.getAllByRole("option").map((o) => o.textContent ?? "")
    expect(options.map((o) => o.match(/^(Link|Mention|Bookmark|Embed)/)?.[0])).toEqual(["Link", "Mention", "Bookmark", "Embed"])
    expect(screen.getAllByRole("option")[3]).toHaveTextContent("Show the YouTube player here")
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true")
    expect(list).toBeInTheDocument()
    act(() => {
      editor.view.someProp("handleKeyDown", (f) => f(editor.view, new KeyboardEvent("keydown", { key: "ArrowUp" })))
    })
    expect(screen.getAllByRole("option")[3]).toHaveAttribute("aria-selected", "true")
    act(() => {
      editor.view.someProp("handleKeyDown", (f) => f(editor.view, new KeyboardEvent("keydown", { key: "Enter" })))
    })
    await vi.waitFor(() => expect(editor.getJSON().content?.[0].type).toBe("webEmbed"))
  })

  it("keeps the link bar away while it is open, and Escape keeps the link with its bar", async () => {
    const editor = await mountDoc({
      extra: (e) => (
        <>
          <PasteMenu editor={e} />
          <LinkBubbleMenu editor={e} />
        </>
      ),
    })
    set(editor, [{ type: "paragraph", content: [{ type: "text", text: "plan", marks: [{ type: "link", attrs: { href: "https://example.com/plan" } }] }, { type: "text", text: " and " }] }])
    const caretAt = (pos: number) => act(() => editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos))))
    // The bar, met once in a link, then the caret after the text.
    caretAt(2)
    await screen.findByRole("toolbar", { name: "Link" }, { timeout: 10_000 })
    caretAt(10)
    await vi.waitFor(() => expect(screen.queryByRole("toolbar", { name: "Link" })).toBeNull())
    paste(editor, "https://example.com/a-long-article-about-something")
    await screen.findByRole("listbox", { name: "Paste as" })
    await tick(400)
    expect(screen.queryByRole("toolbar", { name: "Link" })).toBeNull()
    act(() => {
      editor.view.someProp("handleKeyDown", (f) => f(editor.view, new KeyboardEvent("keydown", { key: "Escape" })))
    })
    expect(screen.queryByRole("listbox", { name: "Paste as" })).toBeNull()
    expect(await screen.findByRole("toolbar", { name: "Link" }, { timeout: 10_000 })).toBeInTheDocument()
  }, 20_000)

  it("offers no Embed for a site the doc doesn't frame", async () => {
    const editor = await mountDoc({ extra: (e) => <PasteMenu editor={e} /> })
    paste(editor, "https://example.com/a-long-article-about-something")
    await screen.findByRole("listbox", { name: "Paste as" })
    expect(screen.getAllByRole("option")).toHaveLength(3)
  })
})

describe("the link bar (N48, L6)", () => {
  it("shows for a caret in a link, closes on Escape until the caret comes back, and edits with Save and Cancel", async () => {
    const editor = await mountDoc({ extra: (e) => <LinkBubbleMenu editor={e} /> })
    set(editor, [{ type: "paragraph", content: [{ type: "text", text: "read the plan", marks: [{ type: "link", attrs: { href: "https://example.com/plan" } }] }, { type: "text", text: " today" }] }])
    const caretAt = (pos: number) => act(() => editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos))))
    caretAt(4)
    const bar = await screen.findByRole("toolbar", { name: "Link" }, { timeout: 10_000 })
    expect(screen.getByRole("button", { name: "Open https://example.com/plan" })).toBeInTheDocument()

    fireEvent.keyDown(bar, { key: "Escape" })
    await vi.waitFor(() => expect(screen.queryByRole("toolbar", { name: "Link" })).toBeNull())
    caretAt(18)
    caretAt(5)
    expect(await screen.findByRole("toolbar", { name: "Link" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Edit link" }))
    expect(await screen.findByRole("button", { name: "Cancel" })).toBeInTheDocument()
    expect(screen.queryByText("Open in a new tab")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    await vi.waitFor(() => expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull())
    expect(editor.getHTML()).toContain('href="https://example.com/plan"')
  }, 20_000)

  it("puts the caret where a plain click lands in a link (never the whole link selected), and opens it on Ctrl-click", async () => {
    const editor = await mountDoc()
    set(editor, [{ type: "paragraph", content: [{ type: "text", text: "read the plan", marks: [{ type: "link", attrs: { href: "https://example.com/plan" } }] }] }])
    act(() => editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 4))))
    const click = (init: MouseEventInit) => editor.view.someProp("handleClick", (f) => f(editor.view, 4, new MouseEvent("click", init)))
    expect(click({})).toBeFalsy()
    expect(editor.state.selection.empty).toBe(true)
    const open = vi.spyOn(window, "open").mockImplementation(() => null)
    expect(click({ ctrlKey: true })).toBe(true)
    expect(open).toHaveBeenCalledWith("https://example.com/plan", "_blank", "noopener,noreferrer")
    open.mockRestore()
  })

  it("gives a reader Open and Copy after a pointer rests on a link, and nothing to change", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const editor = await mountDoc({ editable: false, extra: (e) => <LinkBubbleMenu editor={e} /> })
    set(editor, [{ type: "paragraph", content: [{ type: "text", text: "the plan", marks: [{ type: "link", attrs: { href: "https://example.com/plan" } }] }] }])
    const a = editor.view.dom.querySelector("a[href]")!
    fireEvent.mouseOver(a)
    await act(async () => void vi.advanceTimersByTime(50))
    fireEvent.mouseOver(a)
    await act(async () => void vi.advanceTimersByTime(400))
    expect(await screen.findByRole("toolbar", { name: "Link" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Edit link" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Remove link" })).toBeNull()
    vi.useRealTimers()
  })
})
