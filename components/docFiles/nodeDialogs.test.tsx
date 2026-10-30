import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { SWRConfig } from "swr"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

import { SWRMutateBridge } from "@/components/providers/SWRMutateBridge"
import userSlice from "@/store/slice/userSlice"
import { pinTestClock } from "@/lib/testing/testClock"
import type { TreeNodeJSON } from "@/types/docGraph"

// Docs & Files' dialogs (docs F1b), a dialog on a computer and the shared
// sheet on a phone, their buttons in the footer: a new folder, a link (https
// only, checked as the server checks it), a colour, a file's new version with
// its note, and Move to… for one item or several.

const sheet = vi.hoisted(() => ({ on: false }))
vi.mock("@/components/ui/overlayMode", () => ({ useSheetMode: () => sheet.on, SHEET_QUERY: "" }))

const levels: Record<string, TreeNodeJSON[]> = {}
const post = vi.fn(async (url: string, body: unknown, config?: unknown): Promise<{ data: { data: unknown } }> => {
  void body
  void config
  if (url === "/doc/createDoc") return { data: { data: { doc_uuid: "made-1", doc_title: "" } } }
  if (url === "/doc/move/preview") return { data: { data: { available: true, can_adopt: true, lose: 0, gain: 0, summary: "No one's access changes." } } }
  if (url === "/doc/move") return { data: { data: { doc_uuid: "x", parent_uuid: "", access: "keep" } } }
  if (url.endsWith("/versions")) return { data: { data: { n: 4, attachment_id: "att-4", name: "brief-signed.pdf", size_bytes: 10, mime: "application/pdf", created_at: "2026-10-21T09:00:00Z" } } }
  return { data: { data: { count: 1 } } }
})
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: {
    get: async (url: string) => ({ data: { data: { parent: "", nodes: levels[url] ?? [], hidden: 0, count: (levels[url] ?? []).length } } }),
    post: (url: string, body: unknown, config?: unknown) => post(url, body, config),
  },
}))
const toasts = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ toast: (t: unknown) => (toasts(t), { id: "t", dismiss: vi.fn(), update: vi.fn() }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/app/project/p-1" }))

import NodeDialogs from "./NodeDialogs"

// The rows' and versions' dates are read against one today (lib/testing/testClock).
pinTestClock()

const close = vi.fn()
function show(dialog: React.ComponentProps<typeof NodeDialogs>["dialog"]) {
  render(
    <Provider store={configureStore({ reducer: { users: userSlice.reducer } })}>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <SWRMutateBridge />
        <NodeDialogs dialog={dialog} onClose={close} />
      </SWRConfig>
    </Provider>,
  )
}
const node = (uuid: string, title: string, kind?: "folder" | "file" | "link"): TreeNodeJSON => ({ kind: "doc", uuid, title, has_children: false, can_edit: true, ...(kind ? { node_kind: kind } : {}) })

beforeEach(() => {
  sheet.on = false
  post.mockClear()
  toasts.mockClear()
  close.mockClear()
  for (const k of Object.keys(levels)) delete levels[k]
})
afterEach(cleanup)

describe("New folder", () => {
  it("makes a folder with its name where it was asked for, and asks for a name first", async () => {
    show({ kind: "folder", place: { space: "project:p-1" } })
    const create = await screen.findByRole("button", { name: "Create folder" })
    expect(create).toBeDisabled()
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "  Contracts " } })
    fireEvent.click(create)
    await waitFor(() => expect(post).toHaveBeenCalledWith("/doc/createDoc", { doc_title: "Contracts", space: "project:p-1", doc_private: true, node_kind: "folder" }, undefined))
    await waitFor(() => expect(close).toHaveBeenCalled())
  })
})

describe("Add a link", () => {
  it("takes https only, and says what's wrong in the field", async () => {
    show({ kind: "link", place: { parentId: "folder-1", parentPrivate: false } })
    const field = await screen.findByRole("textbox", { name: "Link" })
    fireEvent.change(field, { target: { value: "http://example.com/plan" } })
    fireEvent.click(screen.getByRole("button", { name: "Add link" }))
    expect(await screen.findByText("Only https:// links can be added.")).toBeTruthy()
    expect(field).toHaveAttribute("aria-invalid", "true")
    expect(post).not.toHaveBeenCalled()
  })

  it("adds a link with its address and, if given, its name", async () => {
    show({ kind: "link", place: { parentId: "folder-1", parentPrivate: false } })
    fireEvent.change(await screen.findByRole("textbox", { name: "Link" }), { target: { value: "figma.com/file/abc" } })
    fireEvent.change(screen.getByRole("textbox", { name: "Name (optional)" }), { target: { value: "Launch designs" } })
    fireEvent.click(screen.getByRole("button", { name: "Add link" }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/doc/createDoc",
        { doc_title: "Launch designs", parent_uuid: "folder-1", doc_private: false, node_kind: "link", link_url: "https://figma.com/file/abc" },
        undefined,
      ),
    )
    await waitFor(() => expect(close).toHaveBeenCalled())
  })
})

describe("Colour, on a phone", () => {
  it("is a sheet of named swatches that colours every item at once, Cancel in its footer", async () => {
    sheet.on = true
    show({ kind: "colour", ids: ["a", "b", "c"], current: "moss" })
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Colour 3 items")).toBeTruthy()
    expect(dialog.querySelector("[data-sheet-footer]")?.textContent).toContain("Cancel")
    fireEvent.click(within(dialog).getByRole("radio", { name: "Berry" }))
    await waitFor(() => expect(post).toHaveBeenCalledWith("/doc/color", { doc_uuids: ["a", "b", "c"], color: "berry" }, { suppressErrorToast: true }))
    await waitFor(() => expect(close).toHaveBeenCalled())
  })
})

describe("Replace with a new version", () => {
  it("uploads the chosen file with what changed, then says it's the new version", async () => {
    show({ kind: "replace", file: { id: "file-1", title: "brief.pdf" } })
    const upload = await screen.findByRole("button", { name: "Upload new version" })
    expect(upload).toBeDisabled()
    const input = document.querySelector<HTMLInputElement>("input[type=file]")!
    expect(input.hidden || input.className.includes("hidden")).toBe(true)
    const chosen = new File(["%PDF"], "brief-signed.pdf", { type: "application/pdf" })
    await act(async () => fireEvent.change(input, { target: { files: [chosen] } }))
    expect(screen.getByText("brief-signed.pdf")).toBeTruthy()
    // Its size as the rows and the versions say one ("4 bytes", "2.5 KB").
    expect(screen.getByText("4 bytes")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Choose another" })).toBeTruthy()
    fireEvent.change(screen.getByRole("textbox", { name: "What changed (optional)" }), { target: { value: "Signed by the client" } })
    fireEvent.click(upload)
    await waitFor(() => expect(post.mock.calls.some(([url]) => url === "/doc/files/file-1/versions")).toBe(true))
    const form = post.mock.calls.find(([url]) => url === "/doc/files/file-1/versions")![1] as FormData
    expect(form.get("note")).toBe("Signed by the client")
    expect((form.get("file") as File).name).toBe("brief-signed.pdf")
    await waitFor(() => expect(toasts).toHaveBeenCalledWith(expect.objectContaining({ title: "“brief.pdf” is now version 4" })))
    expect(close).toHaveBeenCalled()
  })
})

describe("Move to…", () => {
  it("lists where things can go (pages and folders, not files, links or what's moving), goes in, and moves them all there", async () => {
    levels["/doc/children?space=project%3Ap-1&limit=100"] = [node("drafts", "Drafts", "folder"), node("plan", "Launch plan"), node("brief", "brief.pdf", "file"), node("site", "Figma", "link"), node("moving-1", "Notes")]
    levels["/doc/children?parent=drafts&limit=100"] = [node("old", "Old drafts", "folder")]
    show({ kind: "move", items: [{ id: "moving-1", title: "Notes", from: null }, { id: "moving-2", title: "deck.pptx", from: null }], space: "project:p-1", start: [{ id: null, title: "Website relaunch" }] })
    expect(await screen.findByText("Move 2 items to…")).toBeTruthy()
    const here = await screen.findByRole("button", { name: "Move here" })
    // They're at the top already.
    expect(here).toBeDisabled()
    const list = await screen.findByRole("list", { name: "Places to move to" })
    await waitFor(() => expect(within(list).getAllByRole("button").map((b) => b.textContent)).toEqual(["Drafts", "Launch plan"]))
    fireEvent.click(within(list).getByRole("button", { name: "Drafts" }))
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Places to move to" })).getAllByRole("button").map((b) => b.textContent)).toEqual(["Old drafts"]))
    fireEvent.click(screen.getByRole("button", { name: "Move here" }))
    await waitFor(() => expect(post.mock.calls.filter(([url]) => url === "/doc/move").map(([, body]) => body)).toEqual([
      { doc_uuid: "moving-1", parent_uuid: "drafts", place: "last", access: "keep" },
      { doc_uuid: "moving-2", parent_uuid: "drafts", place: "last", access: "keep" },
    ]))
    await waitFor(() => expect(toasts).toHaveBeenCalledWith(expect.objectContaining({ title: "Moved 2 items to “Drafts”" })))
    expect(close).toHaveBeenCalled()
  })

  it("goes back up the way it came", async () => {
    levels["/doc/children?space=project%3Ap-1&limit=100"] = [node("drafts", "Drafts", "folder")]
    levels["/doc/children?parent=drafts&limit=100"] = []
    show({ kind: "move", items: [{ id: "n", title: "Notes", from: "drafts" }], space: "project:p-1", start: [{ id: null, title: "Website relaunch" }, { id: "drafts", title: "Drafts" }] })
    expect(await screen.findByText("Nothing to move into here.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Move here" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Back to Website relaunch" }))
    expect(await screen.findByRole("button", { name: "Drafts" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Move here" })).toBeEnabled()
  })
})
