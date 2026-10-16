import * as React from "react"
import * as Y from "yjs"
import { beforeAll, afterEach, describe, expect, it, vi } from "vitest"
import { loadBlocks } from "@/components/docEditor/registry/factory"
import { act, cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import type { Editor } from "@tiptap/core"
import type { HocuspocusProvider } from "@hocuspocus/provider"

import { EVERY_BLOCK, markTypesOf, nodeTypesOf, offlineProvider } from "@/components/docEditor/docTestKit"
import { MediaQueryProvider } from "@/context/MediaQueryContext"

// The guest's shared doc page, with the REAL editor (no mock of the editor or
// its hook). y-prosemirror deletes from its copy of the document every element
// its editor's schema can't hold, so a guest viewer built from a shorter list
// than the doc editor's didn't only draw less: it dropped every callout,
// toggle, to-do list and table embed, and drew the rest at chat size. Here a
// doc holding one of every block arrives over the live document, and every
// block must still be there, in the guest's copy and on the page.

const collab = vi.hoisted(() => ({ provider: null as unknown }))
vi.mock("@/hooks/useCollaborationProvider", () => ({
  useCollaborationProvider: () => ({ provider: collab.provider, synced: !!collab.provider }),
}))
// Data hooks only (never the editor): a guest's node views must ask for nothing.
vi.mock("@/hooks/useMqttTopic", () => ({ useMqttTopic: () => undefined }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/guest/d/token" }))

import { GuestDocViewer } from "./GuestDocViewer"
import { useDocEditor } from "@/components/docEditor/useDocEditor"

// The doc's own blocks load once, as the app loads them, before any doc editor is built.
// The guest's blocks, and the doc page's (its author writes the doc), which
// has some of its own: the soft lock, table editing (registry/factory.ts).
beforeAll(async () => {
  await loadBlocks("guest", { ai: true })
  await loadBlocks("doc", { ai: true })
}, 30_000)

const store = configureStore({ reducer: { ui: (s: Record<string, unknown> = {}) => s } })
/** What the app's root gives every page, the guest's included (ClientProviders). */
const Shell = ({ children }: { children: React.ReactNode }) => (
  <Provider store={store}>
    <MediaQueryProvider>{children}</MediaQueryProvider>
  </Provider>
)
const providers: HocuspocusProvider[] = []
const tick = (ms = 20) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })

afterEach(() => {
  cleanup()
  while (providers.length) providers.pop()?.destroy()
  collab.provider = null
  document.body.innerHTML = ""
})

/** The doc as its author's editor (the doc page's) writes it into the shared document. */
async function authorsDoc(): Promise<{ update: Uint8Array; editor: Editor }> {
  const provider = offlineProvider()
  providers.push(provider)
  let editor: Editor | null = null
  function Author() {
    editor = useDocEditor({
      collaboration: { enabled: true, documentId: "doc-1", username: "Author", userId: "author" },
      provider,
      providerSynced: true,
    }) as unknown as Editor | null
    return null
  }
  render(<Shell><Author /></Shell>)
  await tick()
  expect(editor).toBeTruthy()
  await act(async () => {
    editor!.commands.setContent(EVERY_BLOCK)
  })
  await tick()
  return { update: Y.encodeStateAsUpdate(provider.document), editor: editor! }
}

describe("a guest's shared doc", () => {
  it("keeps every block the doc holds, in the shared copy and on the page", async () => {
    const { update, editor: author } = await authorsDoc()
    const written = author.getJSON()
    // The author's editor holds every block (the fixture itself is sound).
    expect([...nodeTypesOf(written)]).toEqual(expect.arrayContaining([...nodeTypesOf(EVERY_BLOCK)]))

    // The guest's copy arrives with the whole document, as from the server.
    const guestDoc = new Y.Doc()
    Y.applyUpdate(guestDoc, update)
    const guest = offlineProvider(guestDoc)
    providers.push(guest)
    collab.provider = guest

    const { container } = render(
      <Shell>
        <GuestDocViewer documentName="doc-1" tokenFetcher={async () => "jwt"} labelledBy="doc-title" />
      </Shell>,
    )
    await tick(60)

    const pm = container.querySelector(".ProseMirror") as (HTMLElement & { editor?: Editor }) | null
    expect(pm, "the guest sees the document").toBeTruthy()
    const shown = pm!.editor!.getJSON()

    // Nothing dropped from the guest's copy of the shared document...
    // (Y.XmlElement's toString writes node names in lower case.)
    const shared = guestDoc.getXmlFragment("default").toString().toLowerCase()
    for (const name of ["callout", "collapsible", "tableEmbed", "taskList", "taskItem", "poll", "chartEmbed", "diffEmbed", "recordingEmbed", "mention", "channelMention", "entityMention", "image", "codeBlock", "horizontalRule"]) {
      expect(shared, `the shared document still holds its ${name}`).toContain(`<${name.toLowerCase()}`)
    }
    // ...or from what the guest's editor holds: the author's document, whole.
    expect(shown).toEqual(written)
    expect([...markTypesOf(shown)].sort()).toEqual([...markTypesOf(EVERY_BLOCK)].sort())

    // And on the page, each block drawn as the doc draws it.
    expect(pm!.querySelector('[data-type="callout"]')?.textContent).toContain("a callout")
    expect(pm!.querySelector('[data-type="collapsible"]')?.textContent).toContain("inside the toggle")
    expect(pm!.querySelectorAll("ul.task-list li.task-item")).toHaveLength(2)
    expect(pm!.querySelector('[data-type="table-embed"]')?.textContent).toContain("isn't shared through this link")
    expect(pm!.querySelector('[data-type="mention"]')?.textContent).toContain("Sam Rivera")
  })

  it("reads at the doc's own scale, not a chat message's", async () => {
    const { update } = await authorsDoc()
    const guestDoc = new Y.Doc()
    Y.applyUpdate(guestDoc, update)
    const guest = offlineProvider(guestDoc)
    providers.push(guest)
    collab.provider = guest
    const { container } = render(
      <Shell>
        <GuestDocViewer documentName="doc-1" tokenFetcher={async () => "jwt"} labelledBy="doc-title" />
      </Shell>,
    )
    await tick(60)
    const frame = container.querySelector(".ProseMirror")!.parentElement!
    expect(frame.classList).toContain("minimal-tiptap-editor")
    expect(frame.classList).toContain("doc-editor")
    // Named by the page's title, read only.
    const pm = container.querySelector(".ProseMirror")!
    expect(pm.getAttribute("role")).toBe("textbox")
    expect(pm.getAttribute("aria-labelledby")).toBe("doc-title")
    expect(pm.getAttribute("aria-readonly")).toBe("true")
  })

  it("is built with the doc editor's schema, node for node and attribute for attribute", async () => {
    const { update, editor: author } = await authorsDoc()
    const guestDoc = new Y.Doc()
    Y.applyUpdate(guestDoc, update)
    const guest = offlineProvider(guestDoc)
    providers.push(guest)
    collab.provider = guest
    const { container } = render(
      <Shell>
        <GuestDocViewer documentName="doc-1" tokenFetcher={async () => "jwt"} />
      </Shell>,
    )
    await tick(60)
    const guestEditor = (container.querySelector(".ProseMirror") as HTMLElement & { editor?: Editor }).editor!
    const shape = (e: Editor) => ({
      nodes: Object.fromEntries(Object.entries(e.schema.nodes).map(([n, t]) => [n, Object.keys(t.spec.attrs ?? {}).sort()])),
      marks: Object.fromEntries(Object.entries(e.schema.marks).map(([n, t]) => [n, Object.keys(t.spec.attrs ?? {}).sort()])),
    })
    expect(shape(guestEditor)).toEqual(shape(author))
  })
})
