import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { SWRConfig } from "swr"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

import { SWRMutateBridge } from "@/components/providers/SWRMutateBridge"
import { TooltipProvider } from "@/components/ui/tooltip"
import userSlice from "@/store/slice/userSlice"
import { pinTestClock } from "@/lib/testing/testClock"
import type { DocInfoInterface } from "@/types/doc"
import type { DocNodeFields, TreeNodeJSON } from "@/types/docGraph"

// A folder, a file and a link at their own address (docs F1b): the doc
// route draws each as itself, never the editor. A folder opens in place: a
// breadcrumb, its tile and name, its contents at full width (pages, folders,
// files, links), New doc ▾ to add to it, files dropped anywhere on it
// uploaded into it, and, empty, a state in the docs area's hue that says so.

const sheet = vi.hoisted(() => ({ on: false }))
vi.mock("@/components/ui/overlayMode", () => ({ useSheetMode: () => sheet.on, SHEET_QUERY: "" }))
const answers: Record<string, unknown> = {}
const post = vi.fn(async (url: string, body: unknown, config?: unknown): Promise<{ data: { data: unknown } }> => {
  void body
  void config
  if (url === "/doc/files") return { data: { data: { kind: "doc", uuid: "up-1", title: "x", has_children: false, node_kind: "file" } } }
  return { data: { data: { doc_uuid: "made-1", doc_title: "" } } }
})
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: {
    get: async (url: string) => {
      if (url in answers) return { data: answers[url] }
      throw Object.assign(new Error("404"), { response: { status: 404, data: { msg: "Not here" } } })
    },
    post: (...args: [string, unknown, unknown?]) => post(...args),
  },
}))
const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/app/doc/folder-1" }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: sheet.on, isDesktop: !sheet.on }) }))
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn(() => ({ id: "t", dismiss: vi.fn(), update: vi.fn() })) }))
vi.mock("@/components/docFiles/FilePreview", () => ({ default: ({ file }: { file: { id: string } }) => <div role="dialog" data-file-preview={file.id} /> }))

import DocNodeView from "./DocNodeView"

// The rows' and versions' dates are read against one today (lib/testing/testClock).
pinTestClock()

type Info = DocInfoInterface & DocNodeFields
const info = (over: Partial<Info>): Info =>
  ({
    doc_uuid: "folder-1",
    doc_title: "Contracts",
    doc_body: "",
    doc_edit_access: 1,
    doc_read_access: 1,
    doc_comment_access: 1,
    doc_editing_users: [],
    doc_reading_users: [],
    doc_commenting_users: [],
    doc_public_comment: false,
    doc_private: true,
    doc_created_by: { user_uuid: "u-1", user_name: "Sam Rivera" },
    doc_comments: [],
    doc_comment_count: 0,
    doc_created_at: "2026-10-20T09:00:00Z",
    doc_updated_at: "2026-10-20T09:00:00Z",
    doc_mqtt_topic: "",
    doc_deleted_at: "0001-01-01T00:00:00Z",
    doc_node_kind: "folder",
    doc_color: "moss",
    ...over,
  }) as Info

const contents: TreeNodeJSON[] = [
  { kind: "doc", uuid: "nda-1", title: "nda.pdf", has_children: false, can_edit: true, node_kind: "file", file: { name: "nda.pdf", size_bytes: 1024, mime: "application/pdf", versions: 1, attachment_id: "att-1" } },
  { kind: "doc", uuid: "msa-1", title: "MSA drafts", has_children: false, can_edit: true, node_kind: "folder" },
]

function show(doc: Info) {
  render(
    <Provider store={configureStore({ reducer: { users: userSlice.reducer } })}>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <SWRMutateBridge />
        <TooltipProvider>
          <DocNodeView doc={doc} />
        </TooltipProvider>
      </SWRConfig>
    </Provider>,
  )
}
const level = (nodes: TreeNodeJSON[]) => ({ msg: "ok", data: { parent: "folder-1", nodes, hidden: 0, count: nodes.length } })
const uploads = () => post.mock.calls.filter(([url]) => url === "/doc/files").map(([, body]) => Object.fromEntries([...(body as FormData).entries()].map(([k, v]) => [k, typeof v === "string" ? v : (v as File).name])))

beforeEach(() => {
  sheet.on = false
  for (const k of Object.keys(answers)) delete answers[k]
  answers["/doc/ancestors/folder-1"] = { msg: "ok", data: { ancestors: [{ kind: "doc", uuid: "clients-1", title: "Clients", has_children: true, node_kind: "folder" }], truncated: false } }
  answers["/doc/children?parent=folder-1&limit=100"] = level(contents)
  post.mockClear()
  push.mockClear()
})
afterEach(cleanup)

describe("a folder, opened", () => {
  it("shows where it is, its tile and name, and its contents at full width", async () => {
    show(info({}))
    const crumbs = await screen.findByRole("navigation", { name: "Breadcrumb" })
    await waitFor(() => expect(within(crumbs).getAllByRole("link").map((a) => a.textContent)).toEqual(["Docs", "Clients"]))
    expect(within(crumbs).getByText("Contracts")).toHaveAttribute("aria-current", "page")
    // The way up fetches its routes on intent, never on sight (on a phone the parent shows).
    expect(within(crumbs).getAllByRole("link").map((a) => a.getAttribute("data-prefetch"))).toEqual(["off", "off"])
    expect(screen.getByRole("heading", { level: 1, name: "Contracts" })).toBeTruthy()
    expect(document.querySelector('[data-folder-view] header [data-node-mark="folder"]')?.className).toMatch(/hue-moss/)
    const tree = await screen.findByRole("tree", { name: "Contracts" })
    const rows = await within(tree).findAllByRole("treeitem")
    expect(rows.map((r) => [r.getAttribute("aria-label"), r.getAttribute("aria-level")])).toEqual([
      ["nda.pdf", "1"],
      ["MSA drafts", "1"],
    ])
    // How many things it holds, and its colour by name.
    expect(document.querySelector("[data-folder-meta]")?.textContent).toBe("2 items · Moss")
  })

  it("adds a page, a folder or a link to itself", async () => {
    show(info({}))
    fireEvent.click(await screen.findByRole("button", { name: "New doc" }))
    await waitFor(() => expect(post).toHaveBeenCalledWith("/doc/createDoc", { doc_title: "", parent_uuid: "folder-1", doc_private: true }))
    await act(async () => fireEvent.keyDown(screen.getByRole("button", { name: "More to add" }), { key: "Enter" }))
    fireEvent.click(await screen.findByRole("menuitem", { name: "Folder" }))
    fireEvent.change(await screen.findByRole("textbox", { name: "Name" }, { timeout: 5000 }), { target: { value: "Signed" } })
    fireEvent.click(screen.getByRole("button", { name: "Create folder" }))
    await waitFor(() => expect(post).toHaveBeenCalledWith("/doc/createDoc", { doc_title: "Signed", parent_uuid: "folder-1", doc_private: true, node_kind: "folder" }))
  })

  it("takes files dropped anywhere on it, into itself", async () => {
    show(info({}))
    await screen.findByRole("treeitem", { name: "nda.pdf" })
    const page = document.querySelector<HTMLElement>("[data-folder-view] [data-file-drop]")!
    const dataTransfer = { types: ["Files"], files: [new File(["x"], "sow.docx")], dropEffect: "" }
    fireEvent(page, createEvent.dragOver(page, { dataTransfer }))
    fireEvent(page, createEvent.drop(page, { dataTransfer }))
    await waitFor(() => expect(uploads()).toEqual([{ file: "sow.docx", parent_uuid: "folder-1" }]))
  })

  it("says it's empty, in the docs area's hue, and takes files there too", async () => {
    answers["/doc/children?parent=folder-1&limit=100"] = level([])
    show(info({}))
    const empty = await screen.findByRole("heading", { name: "This folder is empty" })
    const zone = empty.closest<HTMLElement>("[data-file-drop]")!
    expect(zone.querySelector("[data-empty-illustration] [data-hue], [data-empty-illustration] .hue-sky, [data-empty-illustration]")).not.toBeNull()
    expect(zone.querySelector("[data-empty-illustration]")?.getAttribute("data-hue")).toBe("sky")
    const dataTransfer = { types: ["Files"], files: [new File(["x"], "w9.pdf")], dropEffect: "" }
    fireEvent(zone, createEvent.dragOver(zone, { dataTransfer }))
    fireEvent(zone, createEvent.drop(zone, { dataTransfer }))
    await waitFor(() => expect(uploads()).toEqual([{ file: "w9.pdf", parent_uuid: "folder-1" }]))
  })

  it("opens a folder inside it in place", async () => {
    show(info({}))
    fireEvent.click(await screen.findByRole("treeitem", { name: "MSA drafts" }))
    expect(push).toHaveBeenCalledWith("/app/doc/msa-1")
  })
})

describe("a file and a link at their own address", () => {
  it("shows a file's card and opens its preview", async () => {
    answers["/doc/files/file-9/versions"] = { msg: "ok", data: { versions: [{ n: 2, attachment_id: "att-2", name: "brief.pdf", size_bytes: 2048, mime: "application/pdf", created_at: "2026-10-20T09:00:00Z" }] } }
    show(info({ doc_uuid: "file-9", doc_title: "brief.pdf", doc_node_kind: "file", doc_color: undefined }))
    expect(await screen.findByRole("heading", { level: 1, name: "brief.pdf" })).toBeTruthy()
    expect(await screen.findByRole("dialog", {}, { timeout: 5000 })).toHaveAttribute("data-file-preview", "file-9")
  })

  it("shows a link's card, whose Open link opens a new tab", async () => {
    window.open = vi.fn() as unknown as typeof window.open
    show(info({ doc_uuid: "link-9", doc_title: "Launch designs", doc_node_kind: "link", doc_link_url: "https://www.figma.com/file/abc", doc_color: undefined }))
    expect(await screen.findByRole("heading", { level: 1, name: "Launch designs" })).toBeTruthy()
    expect(screen.getByText("figma.com")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Open link" }))
    expect(window.open).toHaveBeenCalledWith("https://www.figma.com/file/abc", "_blank", "noopener,noreferrer")
  })
})
