import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { Editor } from "@tiptap/core"
import * as Y from "yjs"
import { renderHook } from "@testing-library/react"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import "@/components/docEditor/registry"
import { extensionsFor, loadBlocks } from "@/components/docEditor/registry/factory"
import { ALL_EDITIONS, bareContext } from "@/components/docEditor/registry/manifest"
import { offlineProvider } from "@/components/docEditor/docTestKit"
import { usePresence } from "./store"

// Presence from a doc editor's first moment (B8). What this tab says of its
// edits, and what it reads of everyone's, used to start when the presence
// overlay came, a chunk that loads a moment after the doc opens: on a busy
// machine another person's edit in that moment was never news, and the line
// under the title read "Edited just now", not "Edited just now by sam"
// (e2e/docs/presence.spec.ts:108, flaky across gates, 16 Oct 2026). These
// editors are made with the doc's blocks and no overlay at all.

const DOC = "doc-1"
const editors: Editor[] = []
const providers: HocuspocusProvider[] = []

beforeAll(() => loadBlocks("doc", ALL_EDITIONS), 30_000)
afterEach(() => {
  while (editors.length) editors.pop()?.destroy()
  while (providers.length) providers.pop()?.destroy()
})

function docEditor() {
  const ydoc = new Y.Doc()
  const provider = offlineProvider(ydoc, DOC)
  providers.push(provider)
  provider.awareness!.setLocalStateField("user", { id: "u-priya", name: "priya" })
  const editor = new Editor({
    element: document.body.appendChild(document.createElement("div")),
    extensions: extensionsFor({
      ...bareContext("doc", ALL_EDITIONS),
      docId: DOC,
      collaboration: { enabled: true, documentId: DOC, username: "priya", userId: "u-priya" },
      provider,
    }),
  })
  editors.push(editor)
  return { editor, provider }
}

/**
 * Another tab, by its awareness: what it says reaches this one's states as
 * the server passes it on, and is told as y-protocols tells it ("change").
 */
let nextClient = 900
function otherTab(provider: HocuspocusProvider, name: string) {
  const client = nextClient++
  const awareness = provider.awareness as unknown as {
    states: Map<number, Record<string, unknown>>
    meta: Map<number, { clock: number; lastUpdated: number }>
    emit(event: string, args: unknown[]): void
  }
  let clock = 0
  const say = (state: Record<string, unknown>) => {
    const added = awareness.states.has(client) ? [] : [client]
    awareness.states.set(client, { user: { id: `u-${name}`, name }, ...state })
    awareness.meta.set(client, { clock: ++clock, lastUpdated: Date.now() })
    awareness.emit("change", [{ added, updated: added.length ? [] : [client], removed: [] }, "server"])
  }
  return { say, client }
}

/** The doc's presence, as the line under its title reads it. */
const presence = () => renderHook(() => usePresence(DOC))

const frames = (n = 3) => new Promise<void>((r) => {
  const next = (left: number) => (left ? requestAnimationFrame(() => next(left - 1)) : r())
  next(n)
})
/** Tiptap says "create" a moment after the editor is made. */
const created = (editor: Editor) => new Promise<void>((r) => (editor.isInitialized ? r() : editor.on("create", () => r())))

describe("presence, from a doc editor's first moment", () => {
  it("names another person's edit made after the doc opened, before any overlay", async () => {
    const { editor, provider } = docEditor()
    await created(editor)
    const sam = otherTab(provider, "sam")
    sam.say({ mode: "editing" })
    await frames()
    const seen = presence()
    // Here before: what Sam does from now on is news.
    expect(seen.result.current?.people["u-sam"]).toBeTruthy()
    sam.say({ mode: "editing", edited: Date.now() })
    await frames()
    seen.rerender()
    expect(seen.result.current?.edit).toMatchObject({ userId: "u-sam", name: "sam" })
  })

  it("doesn't name an edit made before the doc opened here", async () => {
    const { editor, provider } = docEditor()
    const sam = otherTab(provider, "sam")
    sam.say({ mode: "editing", edited: Date.now() - 60_000 })
    await created(editor)
    await frames()
    const seen = presence()
    expect(seen.result.current?.people["u-sam"]).toBeTruthy()
    expect(seen.result.current?.edit ?? null).toBeNull()
  })

  it("says this tab's edit, at most every 10 seconds, before any overlay, and nothing for one another tab's sync brought", async () => {
    const { editor, provider } = docEditor()
    await created(editor)
    const edited = () => provider.awareness!.getLocalState()?.edited
    editor.view.dispatch(editor.state.tr.insertText("synced ", 1).setMeta("y-sync$", { isChangeOrigin: true }))
    expect(edited()).toBeUndefined()
    vi.useFakeTimers({ toFake: ["Date"] })
    try {
      editor.commands.insertContent("typed")
      const first = edited()
      expect(typeof first).toBe("number")
      vi.setSystemTime(Date.now() + 5_000)
      editor.commands.insertContent(" here")
      expect(edited()).toBe(first)
      vi.setSystemTime(Date.now() + 6_000)
      editor.commands.insertContent(" again")
      expect(edited()).toBeGreaterThan(first as number)
    } finally {
      vi.useRealTimers()
    }
  })

  it("forgets who is here once the doc's last editor goes", async () => {
    const { editor, provider } = docEditor()
    await created(editor)
    otherTab(provider, "sam").say({ mode: "viewing" })
    await frames()
    const seen = presence()
    expect(seen.result.current?.people["u-sam"]).toBeTruthy()
    editors.pop()?.destroy()
    seen.rerender()
    expect(seen.result.current).toBeUndefined()
  })
})
