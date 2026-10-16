import * as React from "react"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import type { Editor } from "@tiptap/react"

import { MediaQueryProvider } from "@/context/MediaQueryContext"
import { TooltipProvider } from "@/components/ui/tooltip"

// "/table"'s "Create a new table" in a doc (docInput.tsx): who can see the
// table follows the doc (tableForDoc.ts). Review, 16 Oct 2026 (P1): it was
// made for the whole workspace whatever the doc was, so what was typed into a
// private doc's new table reached everyone. A doc the workspace can open
// makes a workspace table; a private one, or one whose privacy isn't said, a
// private table.

const DOC = "d0c0e3b1-0000-4000-8000-000000000001"
const api = vi.hoisted(() => ({
  info: {} as Record<string, unknown>,
  posts: [] as Array<{ url: string; body: unknown }>,
}))
vi.mock("@/lib/axiosInstance", () => ({
  default: {
    get: vi.fn(async (url: string) => {
      if (url.startsWith("/doc/getDocInfo/")) return { status: 200, data: { msg: "ok", data: { doc_uuid: DOC, doc_title: "Launch plan", ...api.info } } }
      return { status: 200, data: {} }
    }),
    post: vi.fn(async (url: string, body: unknown) => {
      api.posts.push({ url, body })
      if (url === "/tables") return { data: { data: { id: "t-new", name: "Untitled table" } } }
      return { data: {} }
    }),
  },
  OWN_ERRORS: { suppressErrorToast: true },
}))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => undefined }))
vi.mock("@/hooks/useMqttTopic", () => ({ useMqttTopic: () => undefined }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => `/app/doc/${DOC}` }))
// The floating bars (tippy) have nothing to lay out in jsdom, and this test
// reads none of them.
vi.mock("@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu", () => ({ LinkBubbleMenu: () => null }))
vi.mock("@/components/docEditor/SelectionBar", () => ({ SelectionBar: () => null }))

import DocInput from "./docInput"

// jsdom lays nothing out, and ProseMirror measures a range when the embed
// focuses the editor: empty rects, as for a hidden range, put back after.
const added: string[] = []
beforeAll(() => {
  const proto = Range.prototype as unknown as Record<string, unknown>
  if (typeof proto.getClientRects !== "function") {
    proto.getClientRects = () => Object.assign([], { item: () => null })
    added.push("getClientRects")
  }
  if (typeof proto.getBoundingClientRect !== "function") {
    proto.getBoundingClientRect = () => new DOMRect()
    added.push("getBoundingClientRect")
  }
})
afterAll(() => {
  const proto = Range.prototype as unknown as Record<string, unknown>
  for (const name of added) delete proto[name]
})

beforeEach(() => {
  api.posts.length = 0
})
afterEach(() => cleanup())

async function renderDoc() {
  const store = configureStore({
    reducer: {
      ui: (s: Record<string, unknown> = {}) => s,
      rightPanel: (s = { rightPanelState: { data: {} } }) => s,
    },
  })
  let editor: Editor | null = null
  render(
    <Provider store={store}>
      <MediaQueryProvider>
        <TooltipProvider>
          <DocInput
            value="<p>Plan</p>"
            editable
            docId={DOC}
            onEditor={(e: Editor | null) => {
              editor = e
            }}
          />
        </TooltipProvider>
      </MediaQueryProvider>
    </Provider>,
  )
  await waitFor(() => expect(editor).toBeTruthy())
  return editor!
}

/** The table "/table"'s Create a new table makes in this doc, as the request says it. */
async function newTable() {
  const editor = await renderDoc()
  // "/table" opens the picker with this event on this web.
  act(() => {
    window.dispatchEvent(new CustomEvent("doc-embed-table"))
  })
  fireEvent.click(await screen.findByRole("button", { name: /Create a new table/ }))
  await waitFor(() => expect(api.posts.find((p) => p.url === "/tables")).toBeTruthy())
  // And the doc embeds it.
  await waitFor(() => expect(JSON.stringify(editor.getJSON())).toContain("t-new"))
  return api.posts.find((p) => p.url === "/tables")!.body as { visibility?: string }
}

describe("a table made in a doc, from /table", () => {
  it("is private in a private doc", async () => {
    api.info = { doc_private: true }
    expect((await newTable()).visibility).toBe("private")
  })

  it("is private in a doc whose privacy isn't said", async () => {
    api.info = {}
    expect((await newTable()).visibility).toBe("private")
  })

  it("is the workspace's in a doc the workspace can open", async () => {
    api.info = { doc_private: false }
    expect((await newTable()).visibility).toBe("workspace")
  })
})
