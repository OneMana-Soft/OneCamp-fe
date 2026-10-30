import * as React from "react"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import { Editor as CoreEditor } from "@tiptap/core"
import type { Editor } from "@tiptap/react"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import * as Y from "yjs"
import { installRangeRects } from "@/lib/testing/rangeRects"
import { extensionsFor, loadBlocks } from "@/components/docEditor/registry/factory"
import { ALL_EDITIONS, bareContext } from "@/components/docEditor/registry/manifest"
import { offlineProvider } from "@/components/docEditor/docTestKit"
import { createTitleStore } from "@/components/docEditor/docTitleStore"
import { createDocCommandBus, DocBusContext } from "@/components/docEditor/registry/commandBus"
import { MediaQueryProvider } from "@/context/MediaQueryContext"
import { TooltipProvider } from "@/components/ui/tooltip"

// An embedded table's grid (DataTableGrid, its cells, menus and virtual rows:
// about 38 KB gzip) comes with the first table a doc embeds, not with every
// doc: the doc route's weight (scripts/fluidity doc-budgets.json,
// routeKbOverHome). A doc with no embed never asks for it; one whose table
// comes from its first content, an insert, a paste or another person's edit
// shows its grid. Each test is a doc page's own input, rendered.

const DOC = "d0c0e3b1-0000-4000-8000-0000000000e1"
const TABLE = "7ab1e000-0000-4000-8000-000000000001"
const grid = vi.hoisted(() => ({ loads: 0 }))
vi.mock("@/components/table/DataTableGrid", () => {
  grid.loads++
  return { DataTableGrid: ({ tableId }: { tableId: string }) => <div data-testid="table-grid">{tableId}</div> }
})
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: {
    get: vi.fn(async (url: string) => {
      if (url.startsWith("/doc/getDocInfo/")) return { status: 200, data: { msg: "ok", data: { doc_uuid: DOC, doc_title: "Launch plan", doc_private: true } } }
      if (url.startsWith(`/tables/${TABLE}`))
        return { status: 200, data: { data: { table: { id: TABLE, name: "Vendors" }, fields: [], views: [], rows: [], can_manage: true, mqtt_topic: "", row_count: 0 } } }
      return { status: 200, data: {} }
    }),
    post: vi.fn(async () => ({ data: {} })),
  },
}))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => undefined }))
vi.mock("@/hooks/useMqttTopic", () => ({ useMqttTopic: () => undefined }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => `/app/doc/${DOC}` }))
// The selection bar's floating shell, in place (lib/testing/bubbleMenu),
// shown at once rather than 250 ms after a selection: an inserted or pasted
// embed is selected, and on a loaded machine the grid's import outlasted
// that wait, so the real menu came and went on its own clock mid-test.
vi.mock("@/components/minimal-tiptap/components/bubble-menu/bubble-menu", () => import("@/lib/testing/bubbleMenu"))

import DocInput from "@/components/docEditor/docInput"

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

const providers: HocuspocusProvider[] = []
const others: CoreEditor[] = []
afterEach(() => {
  cleanup()
  while (others.length) others.pop()?.destroy()
  while (providers.length) providers.pop()?.destroy()
})

const EMBED = `<div data-type="table-embed" data-table-id="${TABLE}"></div>`

/** The doc page's input on a shared doc (ydoc), as its page renders it. */
async function renderDoc(ydoc = new Y.Doc()) {
  const store = configureStore({ reducer: { ui: (s: Record<string, unknown> = {}) => s, rightPanel: (s = { rightPanelState: { data: {} } }) => s } })
  const provider = offlineProvider(ydoc, DOC)
  providers.push(provider)
  let editor: Editor | null = null
  render(
    <Provider store={store}>
      <MediaQueryProvider>
        <TooltipProvider>
          <DocBusContext.Provider value={createDocCommandBus(DOC)}>
            <DocInput
              value="<p>Plan</p>"
              editable
              docId={DOC}
              provider={provider}
              providerSynced
              collaboration={{ enabled: true, documentId: DOC, username: "Sam Rivera", userId: "u-sam" }}
              titleStore={createTitleStore("Launch plan")}
              onEditor={(e: Editor | null) => {
                editor = e
              }}
            />
          </DocBusContext.Provider>
        </TooltipProvider>
      </MediaQueryProvider>
    </Provider>,
  )
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50))
  })
  return editor!
}

/** Another person's editor on a copy of the same shared doc, each one's changes reaching the other. */
function otherPerson(mine: Y.Doc) {
  const theirs = new Y.Doc()
  const REMOTE = "remote"
  theirs.on("update", (u: Uint8Array, origin: unknown) => origin !== REMOTE && Y.applyUpdate(mine, u, REMOTE))
  mine.on("update", (u: Uint8Array, origin: unknown) => origin !== REMOTE && Y.applyUpdate(theirs, u, REMOTE))
  const provider = offlineProvider(theirs, DOC)
  providers.push(provider)
  const editor = new CoreEditor({
    element: document.body.appendChild(document.createElement("div")),
    extensions: extensionsFor({ ...bareContext("guest", ALL_EDITIONS), collaboration: { enabled: true, documentId: DOC, username: "Kai", userId: "u-kai" }, provider }),
  })
  others.push(editor)
  return editor
}

describe("an embedded table's grid", () => {
  // First, before any embed has asked for it in this file.
  it("is never fetched by a doc with no embedded table", async () => {
    const e = await renderDoc()
    await act(async () => {
      e.commands.insertContent("<p>A plan, no table</p>")
      e.view.pasteHTML("<p>pasted</p><ul><li><p>a list</p></li></ul>")
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(grid.loads).toBe(0)
  })

  it("shows for a table the doc held as it opened", async () => {
    const ydoc = new Y.Doc()
    otherPerson(ydoc).commands.insertContent(EMBED)
    await renderDoc(ydoc)
    expect(await screen.findByTestId("table-grid")).toHaveTextContent(TABLE)
    expect(grid.loads).toBe(1)
  })

  it("shows for a table embedded from the editor, pasted, or brought by another person's edit", async () => {
    for (const bring of ["insert", "paste", "another person"] as const) {
      const ydoc = new Y.Doc()
      const e = await renderDoc(ydoc)
      const kai = bring === "another person" ? otherPerson(ydoc) : null
      expect(screen.queryByTestId("table-grid"), bring).toBeNull()
      await act(async () => {
        if (bring === "insert") e.commands.setTableEmbed({ tableId: TABLE })
        else if (bring === "paste") e.view.pasteHTML(`<p>Vendors</p>${EMBED}`)
        else kai!.commands.insertContent(EMBED)
      })
      expect(await screen.findByTestId("table-grid"), bring).toHaveTextContent(TABLE)
      cleanup()
    }
  })
})
