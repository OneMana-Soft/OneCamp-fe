import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { Editor } from "@tiptap/core"
import * as Y from "yjs"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import { installRangeRects } from "@/lib/testing/rangeRects"
import "@/components/docEditor/registry"
import { extensionsFor, loadBlocks } from "@/components/docEditor/registry/factory"
import { ALL_EDITIONS, bareContext } from "@/components/docEditor/registry/manifest"
import { offlineProvider } from "@/components/docEditor/docTestKit"

// The code block's highlighter (lowlight and its common grammars, a chunk of
// its own: highlighter.ts) is fetched when a doc first holds a code block
// (lazyCodeBlock.ts: the whole doc as the editor starts, then what each
// change touched, a collaborator's whole-doc replace included), never by a doc
// with none (review, 16 Oct 2026: the doc route's weight carries no lowlight).
// A fresh page here: nothing has asked for it before the first test.

const hl = vi.hoisted(() => ({ loads: 0 }))
vi.mock("./highlighter", async (importOriginal) => {
  hl.loads++
  return importOriginal()
})

// jsdom has no ClipboardEvent, which a paste is made of (prosemirror-view pasteHTML).
beforeAll(() => {
  if (typeof globalThis.ClipboardEvent === "undefined") {
    ;(globalThis as { ClipboardEvent?: unknown }).ClipboardEvent = class extends Event {
      clipboardData = null
    }
  }
})
beforeAll(() => loadBlocks("doc", ALL_EDITIONS), 30_000)
let restoreRects = () => {}
beforeAll(() => {
  restoreRects = installRangeRects()
})
afterAll(() => restoreRects())

const editors: Editor[] = []
const providers: HocuspocusProvider[] = []
afterEach(() => {
  while (editors.length) editors.pop()!.destroy()
  while (providers.length) providers.pop()!.destroy()
  document.body.innerHTML = ""
})

function make(content = "<p></p>", collab?: { ydoc: Y.Doc; who: string }) {
  const provider = collab ? offlineProvider(collab.ydoc, "doc-1") : undefined
  if (provider) providers.push(provider)
  const editor = new Editor({
    element: document.body.appendChild(document.createElement("div")),
    extensions: extensionsFor({
      ...bareContext("doc", ALL_EDITIONS),
      ...(collab ? { collaboration: { enabled: true, documentId: "doc-1", username: collab.who, userId: `u-${collab.who}` }, provider } : {}),
    }),
    ...(collab ? {} : { content }),
  })
  editors.push(editor)
  return editor
}

const coloured = (e: Editor) => e.view.dom.querySelectorAll('pre [class*="hljs-"]').length
const GO = '<pre><code class="language-go">func main() { return }</code></pre>'

describe("the code block's highlighter", () => {
  // First: a fresh page has fetched nothing.
  it("is never fetched by a doc with no code block, typed in, pasted into, rewritten", async () => {
    const e = make("<p>Launch plan</p>")
    e.commands.insertContent(" for Thursday")
    e.view.pasteText("a pasted line")
    e.view.pasteHTML("<p>pasted <code>inline code</code></p><ul><li><p>a list</p></li></ul>")
    e.commands.setContent("<h2>Rewritten</h2><p>still no code block</p>")
    await new Promise((r) => setTimeout(r, 50))
    expect(hl.loads).toBe(0)
  })

  it("colours a code block put in from the editor, pasted, or brought by another person's edit", async () => {
    for (const bring of ["insert", "paste", "another person"] as const) {
      const mine = new Y.Doc()
      const e = bring === "another person" ? make(undefined, { ydoc: mine, who: "sam" }) : make()
      if (bring === "insert") e.commands.insertContent(GO)
      else if (bring === "paste") e.view.pasteHTML(`<p>Before</p>${GO}`)
      else {
        const theirs = new Y.Doc()
        const REMOTE = "remote"
        theirs.on("update", (u: Uint8Array, origin: unknown) => origin !== REMOTE && Y.applyUpdate(mine, u, REMOTE))
        mine.on("update", (u: Uint8Array, origin: unknown) => origin !== REMOTE && Y.applyUpdate(theirs, u, REMOTE))
        make(undefined, { ydoc: theirs, who: "kai" }).commands.insertContent(GO)
        expect(e.view.dom.querySelector("pre"), bring).toBeTruthy()
      }
      await vi.waitFor(() => expect(coloured(e), bring).toBeGreaterThan(0), { timeout: 5000 })
    }
    expect(hl.loads).toBe(1)
  })
})
