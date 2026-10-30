import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"

// A doc's address holds a page, a folder, a file or a link (docs F1b). A
// page opens in the doc's view (the editor); anything else opens as itself,
// from a chunk of its own, and never mounts the doc's view, whose live
// session the server would refuse ("not a page", F1 point 1). A folder whose
// facts its row put in the cache opens as one at once.

const answers: Record<string, unknown> = {}
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: { get: async (url: string) => ({ data: answers[url] }) },
}))
vi.mock("next/navigation", () => ({ useParams: () => ({ "doc-id": "doc-0001" }) }))
const docViews = vi.fn()
vi.mock("@/components/views/DocView", async () => {
  const { useFetch } = await import("@/hooks/useFetch")
  return {
    DocView: ({ docId }: { docId: string }) => {
      docViews(docId)
      return <div data-doc-view={docId} />
    },
    useDocInfo: (docId: string) => useFetch(`/doc/getDocInfo/${docId}`, undefined, undefined, { suppressErrorToast: true }),
  }
})
const nodeView = vi.hoisted(() => ({ fails: true }))
vi.mock("@/components/docFiles/DocNodeView", () => {
  if (nodeView.fails) throw new Error("Loading chunk 98 failed")
  return { default: ({ doc }: { doc: { doc_node_kind: string } }) => <div data-node-view={doc.doc_node_kind} /> }
})

import Page from "./page"

function show(seed?: Map<string, unknown>) {
  render(
    <SWRConfig value={{ provider: () => (seed ?? new Map()) as never, dedupingInterval: 0 }}>
      <Page />
    </SWRConfig>,
  )
}

beforeEach(() => {
  for (const k of Object.keys(answers)) delete answers[k]
  docViews.mockClear()
})
afterEach(cleanup)

describe("a doc's address", () => {
  // First in the file: once a folder's code is in, it stays in.
  it("says a folder couldn't load when its code can't come, and Try again brings it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    answers["/doc/getDocInfo/doc-0001"] = { msg: "ok", data: { doc_uuid: "doc-0001", doc_title: "Contracts", doc_node_kind: "folder" } }
    show()
    expect(await screen.findByText("Couldn't load this folder")).toBeTruthy()
    nodeView.fails = false
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(document.querySelector("[data-node-view=folder]")).not.toBeNull())
    warn.mockRestore()
  })

  it("opens a page in the doc's view", async () => {
    answers["/doc/getDocInfo/doc-0001"] = { msg: "ok", data: { doc_uuid: "doc-0001", doc_title: "Plan" } }
    show()
    await waitFor(() => expect(document.querySelector("[data-doc-view]")).not.toBeNull())
    expect(document.querySelector("[data-node-view]")).toBeNull()
  })

  it("opens a folder as itself", async () => {
    answers["/doc/getDocInfo/doc-0001"] = { msg: "ok", data: { doc_uuid: "doc-0001", doc_title: "Contracts", doc_node_kind: "folder" } }
    show()
    expect(await screen.findByText((_, el) => el?.getAttribute("data-node-view") === "folder", undefined, { timeout: 5000 })).toBeTruthy()
    expect(document.querySelector("[data-doc-view]")).toBeNull()
  })

  it("never mounts the doc's view for a folder its row already said is one", async () => {
    answers["/doc/getDocInfo/doc-0001"] = { msg: "ok", data: { doc_uuid: "doc-0001", doc_title: "Contracts", doc_node_kind: "folder" } }
    const seed = new Map<string, unknown>([["/doc/getDocInfo/doc-0001", { data: { msg: "ok", data: { doc_uuid: "doc-0001", doc_title: "Contracts", doc_node_kind: "folder" } } }]])
    show(seed)
    expect(await screen.findByText((_, el) => el?.getAttribute("data-node-view") === "folder", undefined, { timeout: 5000 })).toBeTruthy()
    expect(docViews).not.toHaveBeenCalled()
  })
})

void React
