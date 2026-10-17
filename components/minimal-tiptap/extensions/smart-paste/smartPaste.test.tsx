import * as React from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import { EditorContent, type Editor } from "@tiptap/react"
import { Slice } from "@tiptap/pm/model"
import { TextSelection } from "@tiptap/pm/state"
import type { HocuspocusProvider } from "@hocuspocus/provider"

import { loadBlocks } from "@/components/docEditor/registry/factory"
import { attachBus, createDocCommandBus } from "@/components/docEditor/registry/commandBus"
import { useDocEditor } from "@/components/docEditor/useDocEditor"
import { offlineProvider } from "@/components/docEditor/docTestKit"
import { MediaQueryProvider } from "@/context/MediaQueryContext"
import { pasteMenuOf } from "./smartPaste"
import { chooseLink } from "./linkActions"

// editor.md P0-5 and R6: what a paste becomes in a doc.

beforeAll(() => loadBlocks("doc", { ai: true }), 30_000)

vi.mock("@/hooks/useMqttTopic", () => ({ useMqttTopic: () => undefined }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/app/doc/doc-1" }))
const unfurl = vi.hoisted(() => ({
  unfurlLink: vi.fn(async (url: string) => ({ url, fetched: true, title: "Launch notes", site_name: "OneMana", description: "What we shipped" })),
  storeFromLink: vi.fn(async () => ({ object_uuid: "obj-1", file_name: "icon.png", content_type: "image/png", size: 10 })),
}))
vi.mock("@/services/unfurlService", () => unfurl)

const store = configureStore({ reducer: { ui: (s: Record<string, unknown> = {}) => s } })
const providers: HocuspocusProvider[] = []

afterEach(() => {
  cleanup()
  while (providers.length) providers.pop()?.destroy()
})

async function mountDoc(): Promise<Editor> {
  const provider = offlineProvider()
  providers.push(provider)
  let editor: Editor | null = null
  function Doc() {
    const e = useDocEditor({ collaboration: { enabled: true, documentId: "doc-1", username: "Sam", userId: "sam" }, provider })
    editor = e as unknown as Editor | null
    return e ? <EditorContent editor={e} /> : null
  }
  render(
    <Provider store={store}>
      <MediaQueryProvider>
        <Doc />
      </MediaQueryProvider>
    </Provider>,
  )
  await vi.waitFor(() => expect(editor).not.toBeNull(), { timeout: 10_000 })
  return editor!
}

/** A paste as the browser hands it to the editor. */
function paste(editor: Editor, data: Record<string, string>): boolean {
  const clipboardData = { types: Object.keys(data), files: [] as File[], getData: (t: string) => data[t] ?? "" }
  const event = { clipboardData, preventDefault() {}, stopPropagation() {} } as unknown as ClipboardEvent
  let handled = false
  act(() => {
    handled = !!editor.view.someProp("handlePaste", (f) => f(editor.view, event, Slice.empty))
  })
  return handled
}

const types = (editor: Editor) => (editor.getJSON().content ?? []).map((n) => n.type)

describe("pasting Markdown", () => {
  it("makes blocks of two or more block signals, in a change after the literal text's, each its own undo step", async () => {
    const editor = await mountDoc()
    const undo = editor.state.plugins.find((p) => String((p as unknown as { key: string }).key).startsWith("y-undo$"))
    const manager = (undo?.getState(editor.state) as { undoManager: { stopCapturing(): void } }).undoManager
    const stops = vi.spyOn(manager, "stopCapturing")
    const changes: string[] = []
    editor.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) changes.push(JSON.stringify(transaction.doc.toJSON().content.map((n: { type: string }) => n.type)))
    })

    const md = "# T\n- a\n- b\n> q"
    expect(paste(editor, { "text/plain": md })).toBe(true)
    // First the text, as it was pasted: four lines.
    expect(types(editor)).toEqual(["paragraph", "paragraph", "paragraph", "paragraph"])
    expect(editor.getText()).toContain("# T")
    await vi.waitFor(() => expect(types(editor)).toEqual(["heading", "bulletList", "blockquote"]), { timeout: 20_000 })
    const [h, ul] = editor.getJSON().content!
    expect(h.attrs?.level).toBe(1)
    expect(ul.content).toHaveLength(2)
    // Two changes, the literal one first, with undo's capture stopped
    // around each, so one ⌘Z gives back the text (the browser test, e2e).
    expect(changes[0]).toBe(JSON.stringify(["paragraph", "paragraph", "paragraph", "paragraph"]))
    expect(changes.at(-1)).toBe(JSON.stringify(["heading", "bulletList", "blockquote"]))
    expect(stops.mock.calls.length).toBeGreaterThanOrEqual(4)
    // ⌘Z: the blocks go, and the text as it was pasted is back.
    act(() => void editor.commands.undo())
    expect(types(editor)).toEqual(["paragraph", "paragraph", "paragraph", "paragraph"])
    expect(editor.getText()).toContain("# T")
  }, 30_000)

  it("leaves the literal text to the converter: no paste rule reads its **bold** first", async () => {
    const editor = await mountDoc()
    // Tiptap's paste rules (bold, code) ran on the literal step, took the
    // asterisks out, and the text was no longer what was pasted: it never
    // became blocks (found by the browser test).
    expect(paste(editor, { "text/plain": "# Plan\n- ship **on Friday**\n- the `film` too" })).toBe(true)
    expect(editor.getText()).toContain("**on Friday**")
    await vi.waitFor(() => expect(types(editor)).toEqual(["heading", "bulletList"]), { timeout: 20_000 })
    const json = JSON.stringify(editor.getJSON())
    expect(json).toContain('{"type":"text","marks":[{"type":"bold"}],"text":"on Friday"}')
    expect(json).toMatch(/\{"type":"text","marks":\[\{"type":"code"[^\]]*\],"text":"film"\}/)
  }, 30_000)

  it("leaves one signal, prose, code and Shift alone", async () => {
    const editor = await mountDoc()
    expect(paste(editor, { "text/plain": "- just one dash" })).toBe(false)
    expect(paste(editor, { "text/plain": "A sentence, with a - dash in it." })).toBe(false)

    act(() => void editor.commands.setContent({ type: "doc", content: [{ type: "codeBlock", content: [{ type: "text", text: "x" }] }] }))
    act(() => void editor.commands.setTextSelection(2))
    expect(paste(editor, { "text/plain": "# T\n- a\n- b" })).toBe(false)

    act(() => void editor.commands.setContent("<p></p>"))
    act(() => {
      editor.view.someProp("handleKeyDown", (f) => f(editor.view, new KeyboardEvent("keydown", { key: "V", shiftKey: true, ctrlKey: true })))
    })
    expect(paste(editor, { "text/plain": "# T\n- a\n- b" })).toBe(false)
  })

  it("takes a copy from a code editor as its text, and rich HTML as HTML", async () => {
    const editor = await mountDoc()
    expect(paste(editor, { "text/plain": "# T\n- a\n- b", "text/html": "<p>rich</p>" })).toBe(false)
    expect(paste(editor, { "text/plain": "# T\n- a\n- b", "text/html": "<div>code</div>", "vscode-editor-data": "{}" })).toBe(true)
  })
})

describe("pasting a link", () => {
  const long = "https://github.com/OneMana-Soft/OneCamp/issues/412#issuecomment-123456"

  it("goes in as a link labelled from its shape, and opens the menu", async () => {
    const editor = await mountDoc()
    expect(paste(editor, { "text/plain": long })).toBe(true)
    expect(editor.getText()).toContain("OneMana-Soft/OneCamp#412")
    expect(editor.getHTML()).toContain(`href="${long}"`)
    const menu = pasteMenuOf(editor.state)
    expect(menu).toMatchObject({ href: long, index: 0 })
    // Enter keeps the link: the menu is Link first.
    act(() => {
      editor.view.someProp("handleKeyDown", (f) => f(editor.view, new KeyboardEvent("keydown", { key: "ArrowDown" })))
    })
    expect(pasteMenuOf(editor.state)?.index).toBe(1)
    act(() => {
      editor.view.someProp("handleKeyDown", (f) => f(editor.view, new KeyboardEvent("keydown", { key: "Escape" })))
    })
    expect(pasteMenuOf(editor.state)).toBeNull()
    expect(editor.getHTML()).toContain(`href="${long}"`)
  })

  it("on selected text links the text, with no menu", async () => {
    const editor = await mountDoc()
    act(() => void editor.commands.setContent("<p>read this</p>"))
    act(() => editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 5))))
    expect(paste(editor, { "text/plain": "https://example.com/" })).toBe(false)
    expect(pasteMenuOf(editor.state)).toBeNull()
  })

  it("becomes a bookmark with the page's preview, kept with the doc", async () => {
    const editor = await mountDoc()
    paste(editor, { "text/plain": "https://onemana.dev/blog/launch" })
    act(() => chooseLink(editor, "bookmark"))
    expect(types(editor)).toContain("bookmark")
    await vi.waitFor(() => expect(editor.getJSON().content?.find((n) => n.type === "bookmark")?.attrs).toMatchObject({ title: "Launch notes", siteName: "OneMana" }))
    expect(unfurl.unfurlLink).toHaveBeenCalledWith("https://onemana.dev/blog/launch")
    // The doc's address is one line, alone: the bookmark took its place.
    expect(editor.getText()).not.toContain("onemana.dev/blog")
  })

  it("becomes a mention chip or an embed", async () => {
    const editor = await mountDoc()
    paste(editor, { "text/plain": "https://example.com/post" })
    act(() => chooseLink(editor, "mention"))
    const para = editor.getJSON().content!.find((n) => n.content?.some((c) => c.type === "linkMention"))
    expect(para?.content?.find((c) => c.type === "linkMention")?.attrs?.href).toBe("https://example.com/post")

    act(() => void editor.commands.setContent("<p></p>"))
    paste(editor, { "text/plain": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" })
    act(() => chooseLink(editor, "embed"))
    expect(editor.getJSON().content?.[0]).toMatchObject({ type: "webEmbed", attrs: { src: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } })
  })

  it("keeps the app's own links as links, with no menu", async () => {
    const editor = await mountDoc()
    paste(editor, { "text/plain": `${window.location.origin}/app/doc/123` })
    expect(pasteMenuOf(editor.state)).toBeNull()
  })
})

describe("a picture typed as a link (N28)", () => {
  it("is kept with the doc: never an address on the site, the doc's own once the server has it", async () => {
    const editor = await mountDoc()
    // The doc's page puts its bus on the editor (useDocCommandBus): the doc it keeps pictures with.
    const detach = attachBus(editor, createDocCommandBus("6f0c2b1e-3d4a-4b5c-8d6e-7f8091a2b3c4"))
    act(() => void editor.commands.setContent("<p>![A chart](https://cdn.example.com/chart.png</p>"))
    const end = editor.state.doc.content.size - 1
    act(() => {
      editor.view.someProp("handleTextInput", (f) => f(editor.view, end, end, ")", () => editor.state.tr.insertText(")", end, end)))
    })
    const image = () => editor.getJSON().content?.find((n) => n.type === "image")
    // In the doc at once, with no address: never the site's.
    expect(image()?.attrs).toMatchObject({ src: null, alt: "A chart" })
    expect(String(image()?.attrs?.id)).toMatch(/^up-/)
    await vi.waitFor(() => expect(image()?.attrs?.src).toMatch(/\/doc\/getDocAttachment\/[^/]+\/obj-1$/))
    expect(unfurl.storeFromLink).toHaveBeenCalledWith(expect.any(String), "https://cdn.example.com/chart.png", "image")
    expect(editor.getHTML()).not.toContain("cdn.example.com")
    detach()
  })

  it("is left to the image's own rule where there is no doc (a message)", async () => {
    const editor = await mountDoc()
    act(() => void editor.commands.setContent("<p>![x](https://cdn.example.com/x.png</p>"))
    const end = editor.state.doc.content.size - 1
    act(() => {
      editor.view.someProp("handleTextInput", (f) => f(editor.view, end, end, ")", () => editor.state.tr.insertText(")", end, end)))
    })
    expect(editor.getJSON().content?.find((n) => n.type === "image")?.attrs?.src).toBe("https://cdn.example.com/x.png")
  })
})
