import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { SWRConfig } from "swr"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

import { SWRMutateBridge } from "@/components/providers/SWRMutateBridge"
import userSlice from "@/store/slice/userSlice"
import type { TreeNodeJSON } from "@/types/docGraph"

// The sidebar's Docs section (docs programme B5, structure.md P0.4): the
// workspace's pages, the ones shared with you and your own, each a tree with
// 28 px rows, "+" to add a page inside and "⋯" for its menu. Served from
// memory through the real SWR cache; nothing reaches a server.

const levels: Record<string, { nodes: TreeNodeJSON[]; hidden?: number; count?: number }> = {}
// Answers that aren't a tree level (a doc's info, the sidebar's profile), as the server sends them.
const raw: Record<string, unknown> = {}
const get = vi.fn(async (url: string) => {
  if (url in raw) return { data: raw[url] }
  const a = levels[url]
  if (!a) throw new Error(`no answer for ${url}`)
  return { data: { data: { parent: "", nodes: structuredClone(a.nodes), hidden: a.hidden ?? 0, count: a.count ?? a.nodes.length } } }
})
// What the server's move preview answers (POST /doc/move/preview): nobody's
// access changes unless a test says otherwise, or a refusal to throw.
let preview: Record<string, unknown> | { refused: unknown } = { available: true, can_adopt: true, lose: 0, gain: 0, summary: "No one's access changes." }
const post = vi.fn(async (url: string, body: unknown) => {
  void body
  if (url === "/doc/createDoc") return { data: { data: { doc_uuid: "new-page", doc_title: "" } } }
  if (url === "/doc/move/preview") {
    if ("refused" in preview) throw preview.refused
    return { data: { data: preview } }
  }
  return { data: { data: {} } }
})
vi.mock("@/lib/axiosInstance", () => ({
  default: { get: (url: string) => get(url), post: (url: string, body: unknown) => post(url, body), delete: vi.fn(async () => ({ data: {} })) },
  OWN_ERRORS: { suppressErrorToast: true },
}))
const push = vi.fn()
const nav = vi.hoisted(() => ({ pathname: "/app/doc/plans-0001" }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, prefetch: vi.fn() }), usePathname: () => nav.pathname }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
const confirmed = vi.fn()
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirmed }))
const toasts = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ toast: (t: unknown) => toasts(t) }))

import { DocTree, hiddenLabel, docIdOfPath } from "./DocTree"
import DocsTreeGroups from "./DocsTreeGroups"

const page = (uuid: string, title: string, has_children = false, can_edit = true, priv?: boolean): TreeNodeJSON => ({
  kind: "doc",
  uuid,
  title,
  has_children,
  can_edit,
  ...(priv === undefined ? {} : { private: priv }),
})

function renderWith(ui: React.ReactNode) {
  const store = configureStore({ reducer: { users: userSlice.reducer } })
  render(
    <Provider store={store}>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <SWRMutateBridge />
        {ui}
      </SWRConfig>
    </Provider>,
  )
  return store
}

beforeEach(() => {
  for (const k of Object.keys(levels)) delete levels[k]
  levels["/doc/children?space=workspace&limit=8"] = { nodes: [page("plans-0001", "Plans", true, true, false), page("notes-0001", ""), page("theirs-001", "Board minutes", false, false)] }
  levels["/doc/children?parent=plans-0001&limit=8"] = { nodes: [page("q4-000001", "Q4 launch")], hidden: 2 }
  levels["/doc/children?space=shared&limit=8"] = { nodes: [] }
  levels["/doc/children?space=private&limit=8"] = { nodes: [page("mine-0001", "My notes", false, true, true)] }
  get.mockClear()
  post.mockClear()
  push.mockClear()
  confirmed.mockReset()
  toasts.mockReset()
  preview = { available: true, can_adopt: true, lose: 0, gain: 0, summary: "No one's access changes." }
  window.localStorage.clear()
})
afterEach(cleanup)

// A page moved in the tree is planned as every move is (lib/docMove): the
// server's preview first; one that would change who can open the page asks,
// and moves only when told; a refusal is said.
describe("moving a page in the tree", () => {
  const indentUntitled = async () => {
    renderWith(<DocTree space="workspace" label="Workspace pages" />)
    const untitled = await screen.findByRole("treeitem", { name: "Untitled" })
    act(() => untitled.focus())
    // ⌥⇧→ puts it inside Plans, the row above.
    await act(async () => fireEvent.keyDown(untitled, { key: "ArrowRight", altKey: true, shiftKey: true }))
  }
  const moved = () => post.mock.calls.filter(([url]) => url === "/doc/move")

  it("previews the move, and makes it at once when nobody's access changes", async () => {
    await indentUntitled()
    expect(post).toHaveBeenCalledWith("/doc/move/preview", { doc_uuid: "notes-0001", parent_uuid: "plans-0001", place: "last", access: "keep" })
    await waitFor(() => expect(moved()).toEqual([["/doc/move", { doc_uuid: "notes-0001", parent_uuid: "plans-0001", place: "last", access: "keep" }]]))
    expect(confirmed).not.toHaveBeenCalled()
  })

  it("asks first when the move would change who can open the page, and moves only when told", async () => {
    preview = { available: true, can_adopt: true, lose: 0, gain: 3, summary: "3 people gain access.", space: { kind: "project", uuid: "x", name: "Launch", members: 3 }, was: null }
    await indentUntitled()
    await waitFor(() => expect(confirmed).toHaveBeenCalledTimes(1))
    const asked = confirmed.mock.calls[0][0] as { title: string; description: string; confirmText: string; onConfirm: () => unknown }
    expect(asked).toMatchObject({ title: "3 people gain access.", description: "“Untitled” goes into “Launch”, and everyone in it can open it there.", confirmText: "Move" })
    expect(moved()).toEqual([])
    await act(async () => void (await asked.onConfirm()))
    expect(moved()).toEqual([["/doc/move", { doc_uuid: "notes-0001", parent_uuid: "plans-0001", place: "last", access: "keep" }]])
  })

  it("says why a move was refused, and moves nothing", async () => {
    preview = { refused: { response: { status: 403, data: { code: "needs_full_access", msg: "Moving a page to another space changes who can open it. You need full access to it and to every page under it." } } } }
    await indentUntitled()
    await waitFor(() => expect(toasts).toHaveBeenCalledWith(expect.objectContaining({ title: "The page didn't move", description: "Moving a page to another space changes who can open it. You need full access to it and to every page under it." })))
    expect(moved()).toEqual([])
    expect(confirmed).not.toHaveBeenCalled()
  })
})

describe("a space's page tree", () => {
  it("shows its pages as 28 px rows, a page nobody named by its placeholder, and the page on screen as current", async () => {
    renderWith(<DocTree space="workspace" label="Workspace pages" />)
    const plans = await screen.findByRole("treeitem", { name: "Plans" })
    expect(plans.closest("[data-doc-tree]")?.className).toMatch(/\[&_\.shell-row\]:h-7/)
    expect(screen.getByRole("treeitem", { name: "Untitled" })).toBeTruthy()
    expect(plans).toHaveAttribute("aria-current", "page")
  })

  it("opens a page's children a level at a time, counting the ones the viewer can't open and naming none", async () => {
    renderWith(<DocTree space="workspace" label="Workspace pages" />)
    fireEvent.click(await screen.findByRole("button", { name: "Open Plans" }))
    expect(await screen.findByRole("treeitem", { name: "Q4 launch" })).toBeTruthy()
    expect(screen.getByText("2 pages you can't open")).toBeTruthy()
  })

  it("adds a page inside a row with its +, and opens the new page with its title ready", async () => {
    renderWith(<DocTree space="workspace" label="Workspace pages" />)
    await screen.findByRole("treeitem", { name: "Plans" })
    fireEvent.click(screen.getByRole("button", { name: "Add a page inside Plans" }))
    await waitFor(() => expect(post).toHaveBeenCalledWith("/doc/createDoc", { doc_title: "", parent_uuid: "plans-0001", doc_private: false }))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/doc/new-page?new=1"))
  })

  // Review, 16 Oct 2026 (P1): a subpage was asked for with parent_uuid alone.
  // A server without nested pages (v2.72) reads only doc_title and
  // doc_private, and made it at the top, open to the whole workspace, though
  // its parent was private. It's always sent with its parent's privacy now
  // (the server since makes a subpage as private as its parent whatever it's
  // told), and as private when the row doesn't say.
  it("sends a page added inside a private page as private, and one inside a page whose privacy it doesn't know too", async () => {
    renderWith(<DocTree space="private" label="Private pages" />)
    await screen.findByRole("treeitem", { name: "My notes" })
    fireEvent.click(screen.getByRole("button", { name: "Add a page inside My notes" }))
    await waitFor(() => expect(post).toHaveBeenCalledWith("/doc/createDoc", { doc_title: "", parent_uuid: "mine-0001", doc_private: true }))
    cleanup()
    post.mockClear()
    renderWith(<DocTree space="workspace" label="Workspace pages" />)
    await screen.findByRole("treeitem", { name: "Untitled" })
    fireEvent.click(screen.getByRole("button", { name: "Add a page inside Untitled" }))
    await waitFor(() => expect(post).toHaveBeenCalledWith("/doc/createDoc", { doc_title: "", parent_uuid: "notes-0001", doc_private: true }))
  })

  it("offers no + and no Rename or trash on a page the viewer can't change", async () => {
    renderWith(<DocTree space="workspace" label="Workspace pages" />)
    const theirs = await screen.findByRole("treeitem", { name: "Board minutes" })
    expect(within(theirs).queryByRole("button", { name: /Add a page inside/ })).toBeNull()
    act(() => theirs.focus())
    fireEvent.keyDown(theirs, { key: "F10", shiftKey: true })
    const menu = await screen.findByRole("menu")
    const items = within(menu).getAllByRole("menuitem").map((i) => i.textContent)
    expect(items).toEqual(["Star", "Duplicate", "Copy link"])
  })

  it("opens a row's menu from the keyboard (⇧F10) and from a right click, with the trash alone and last", async () => {
    renderWith(<DocTree space="workspace" label="Workspace pages" />)
    const plans = await screen.findByRole("treeitem", { name: "Plans" })
    fireEvent.contextMenu(plans)
    const menu = await screen.findByRole("menu")
    const items = within(menu).getAllByRole("menuitem").map((i) => i.textContent)
    expect(items).toEqual(["Add a page inside", "Star", "Rename", "Duplicate", "Copy link", "Move to trash"])
  })

  it("gives a title the row's whole width: + and ⋯ take room only on hover or focus, and stay while its menu is open", async () => {
    renderWith(<DocTree space="workspace" label="Workspace pages" />)
    const plans = await screen.findByRole("treeitem", { name: "Plans" })
    const actions = () => plans.querySelector<HTMLElement>("[data-tree-actions]")!.className.split(" ")
    expect(actions()).toEqual(expect.arrayContaining(["hidden", "group-hover:flex", "group-focus-within:flex"]))
    fireEvent.contextMenu(plans)
    await screen.findByRole("menu")
    expect(actions()).toContain("flex")
    expect(actions()).not.toContain("hidden")
  })

  it("stars a page into the Starred section at once, then on the server", async () => {
    const store = renderWith(<DocTree space="workspace" label="Workspace pages" />)
    const plans = await screen.findByRole("treeitem", { name: "Plans" })
    fireEvent.contextMenu(plans)
    fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Star" }))
    expect(store.getState().users.userSidebar.userStarred.map((p) => p.resource_uuid)).toEqual(["plans-0001"])
    await waitFor(() => expect(post).toHaveBeenCalledWith("/places", expect.objectContaining({ kind: "star", resource_kind: "doc", resource_uuid: "plans-0001" })))
  })
})

describe("the sidebar's Docs section", () => {
  it("shows Workspace and Private, and Shared only once something is shared", async () => {
    renderWith(<DocsTreeGroups />)
    expect(await screen.findByRole("tree", { name: "Workspace pages" })).toBeTruthy()
    expect(await screen.findByRole("tree", { name: "Private pages" })).toBeTruthy()
    expect(screen.queryByRole("tree", { name: "Pages shared with me" })).toBeNull()
  })

  it("offers the first doc to someone with none anywhere", async () => {
    levels["/doc/children?space=workspace&limit=8"] = { nodes: [] }
    levels["/doc/children?space=private&limit=8"] = { nodes: [] }
    renderWith(<DocsTreeGroups />)
    fireEvent.click(await screen.findByRole("button", { name: "Write the first doc" }))
    await waitFor(() => expect(post).toHaveBeenCalledWith("/doc/createDoc", { doc_title: "", space: "private", doc_private: true }))
  })

  // Design review PG1-02 (14 Oct 2026): three uncapped trees sat above
  // Channels and Direct messages and pushed them off the first screen.
  it("in the sidebar, shows five pages a level, and folds a group by its name as left", async () => {
    localStorage.clear()
    nav.pathname = "/app/home"
    const many = Array.from({ length: 7 }, (_, i) => page(`page-00${i}0`, `Page ${i}`))
    levels["/doc/children?space=workspace&limit=5"] = { nodes: many.slice(0, 5), hidden: 0 }
    levels["/doc/children?space=shared&limit=5"] = { nodes: [page("from-00001", "From Maya")] }
    levels["/doc/children?space=private&limit=5"] = { nodes: [page("mine-0001", "My notes")] }
    renderWith(<DocsTreeGroups sidebar />)
    expect(await screen.findByRole("tree", { name: "Workspace pages" })).toBeTruthy()
    expect(get).toHaveBeenCalledWith("/doc/children?space=workspace&limit=5")
    // Open until folded, and each fold is kept.
    expect(await screen.findByRole("tree", { name: "Pages shared with me" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Fold Private" }))
    expect(screen.queryByRole("tree", { name: "Private pages" })).toBeNull()
    expect(localStorage.getItem("docsGroup.open.private")).toBe("0")
    // The phone's Pages sheet has the room: everything open, eight a level.
    cleanup()
    renderWith(<DocsTreeGroups />)
    expect(await screen.findByRole("tree", { name: "Private pages" })).toBeTruthy()
    for (const name of ["Fold Workspace", "Fold Shared with me", "Fold Private", "Open Private"]) expect(screen.queryByRole("button", { name })).toBeNull()
  })

  // Coordinator, 15 Oct 2026, after PG1-02: a doc in a folded group was out
  // of sight in the sidebar. The group holding the open doc always opens.
  it("opens the group holding the doc that's open, though it was folded", async () => {
    localStorage.clear()
    localStorage.setItem("docsGroup.open.private", "0")
    localStorage.setItem("docsGroup.open.shared", "0")
    nav.pathname = "/app/doc/mine-0001"
    levels["/doc/children?space=workspace&limit=5"] = { nodes: [page("plans-0001", "Plans")] }
    levels["/doc/children?space=shared&limit=5"] = { nodes: [page("from-00001", "From Maya")] }
    levels["/doc/children?space=private&limit=5"] = { nodes: [page("mine-0001", "My notes")] }
    raw["/doc/getDocInfo/mine-0001"] = { data: { doc_uuid: "mine-0001", doc_private: true, doc_created_by: { user_uuid: "me-1" } } }
    raw["/user/sidebarNav"] = { data: { user_uuid: "me-1" } }
    renderWith(<DocsTreeGroups sidebar />)
    const mine = await screen.findByRole("tree", { name: "Private pages" })
    expect(within(mine).getByRole("treeitem", { name: "My notes" })).toBeTruthy()
    // The other folded group keeps its fold.
    expect(screen.queryByRole("tree", { name: "Pages shared with me" })).toBeNull()
    nav.pathname = "/app/doc/plans-0001"
  })

  it("makes a page at the top of the workspace from its group's +", async () => {
    renderWith(<DocsTreeGroups />)
    fireEvent.click(await screen.findByRole("button", { name: "New page in the workspace" }))
    await waitFor(() => expect(post).toHaveBeenCalledWith("/doc/createDoc", { doc_title: "", space: "workspace", doc_private: false }))
  })
})

describe("its words", () => {
  it("count pages the viewer can't open, never naming them", () => {
    expect(hiddenLabel(1)).toBe("1 page you can't open")
    expect(hiddenLabel(3)).toBe("3 pages you can't open")
  })
  it("know the doc a page's address is on", () => {
    expect(docIdOfPath("/app/doc/98790bd2-f8f8-4a06-acaa-dc20333831cf")).toBe("98790bd2-f8f8-4a06-acaa-dc20333831cf")
    expect(docIdOfPath("/app/doc")).toBeNull()
    expect(docIdOfPath("/app/doc/trash")).toBeNull()
  })
})
