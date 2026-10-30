import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { SWRConfig } from "swr"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

import { SWRMutateBridge } from "@/components/providers/SWRMutateBridge"
import { TooltipProvider } from "@/components/ui/tooltip"
import { DOC_INTENT_MS } from "@/components/navigationBar/desktop/IntentLink"
import userSlice from "@/store/slice/userSlice"
import type { TreeNodeJSON } from "@/types/docGraph"

// What a docs tree keeps out of its first load (fluid-06, the cold tree: the
// sidebar's tree is in every page's), each fetched ahead of the press that
// needs it: a row's menu when a pointer rests on a row; the bulk bar only
// where rows are chosen, when a pointer rests or the keyboard comes in; the
// upload's code while files are dragged over. A menu whose code is in opens
// on the press itself, with no frame between (DOCS-LEAD-2).
//
// The code comes once a file, so these run in order: the menu's code is
// asked for, then held on its way (a press then keeps "⋯"), then in.

const menu = vi.hoisted(() => {
  let land!: () => void
  const landed = new Promise<void>((resolve) => (land = resolve))
  return { asked: 0, landed, land }
})
vi.mock("@/components/docTree/DocRowMenu", async (real) => {
  menu.asked++
  await menu.landed
  return real()
})
const bar = vi.hoisted(() => ({ asked: 0 }))
vi.mock("@/components/docFiles/BulkBar", async (real) => {
  bar.asked++
  return real()
})
// The dialogs' chunk (an open menu fetches it) brings the upload's code too.
const preview = vi.hoisted(() => ({ warm: vi.fn() }))
vi.mock("@/components/docFiles/useNodeDialogs", async (real) => ({ ...(await real<object>()), warmFilePreview: preview.warm, warmNodeDialogs: vi.fn() }))
const uploads = vi.hoisted(() => ({ asked: 0 }))
vi.mock("@/components/docFiles/uploads", async (real) => {
  uploads.asked++
  return real()
})

const levels: Record<string, TreeNodeJSON[]> = {}
const post = vi.fn(async (url: string, body: unknown): Promise<{ data: { data: unknown } }> => {
  void body
  if (url === "/doc/files") return { data: { data: { kind: "doc", uuid: "up-1", title: "x", has_children: false, node_kind: "file" } } }
  return { data: { data: {} } }
})
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: {
    get: async (url: string) => ({ data: { data: { parent: "", nodes: levels[url] ?? [], hidden: 0, count: (levels[url] ?? []).length } } }),
    post: (url: string, body: unknown) => post(url, body),
    delete: vi.fn(),
  },
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/app/project/p-1" }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn(() => ({ id: "t", dismiss: vi.fn(), update: vi.fn() })) }))
vi.mock("@/components/navigationBar/desktop/IntentLink", async (original) => ({ ...(await original<object>()), prefetchDocOnIntent: vi.fn() }))

import { DocTree } from "./DocTree"

const TOP = "/doc/children?space=project%3Ap-1&limit=100"
const rows: TreeNodeJSON[] = [
  { kind: "doc", uuid: "folder-1", title: "Contracts", has_children: false, can_edit: true, node_kind: "folder" },
  { kind: "doc", uuid: "page-1", title: "Launch plan", has_children: false, can_edit: true },
  { kind: "doc", uuid: "page-2", title: "Budget", has_children: false, can_edit: true },
  { kind: "doc", uuid: "file-1", title: "nda.pdf", has_children: false, can_edit: true, node_kind: "file" },
]

function renderTree(props: Partial<React.ComponentProps<typeof DocTree>> = {}) {
  render(
    <Provider store={configureStore({ reducer: { users: userSlice.reducer } })}>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <SWRMutateBridge />
        <TooltipProvider>
          <DocTree space="project:p-1" label="Website relaunch's docs" dense={false} cap={50} {...props} />
        </TooltipProvider>
      </SWRConfig>
    </Provider>,
  )
}
const more = (row: HTMLElement) => within(row).getByRole("button", { name: /^More for / })
/** Long enough for a pointer to count as resting on a row. */
const rest = () => act(() => new Promise((resolve) => setTimeout(resolve, DOC_INTENT_MS + 50)))

beforeEach(() => {
  for (const k of Object.keys(levels)) delete levels[k]
  levels[TOP] = rows
  post.mockClear()
})
afterEach(cleanup)

describe("a row's menu, fetched ahead of its press", () => {
  it("doesn't come with the tree: a pointer resting on a row fetches it, one passing over doesn't", async () => {
    renderTree()
    const plan = await screen.findByRole("treeitem", { name: "Launch plan" })
    expect(menu.asked).toBe(0)
    fireEvent.pointerOver(plan, { pointerType: "mouse" })
    fireEvent.pointerLeave(plan.closest("[data-doc-tree]")!, { pointerType: "mouse" })
    await rest()
    expect(menu.asked).toBe(0)
    fireEvent.pointerOver(plan, { pointerType: "mouse" })
    await rest()
    expect(menu.asked).toBe(1)
  })

  it("keeps ⋯ as it is when pressed before its code is in, and opens once the code lands", async () => {
    renderTree()
    const plan = await screen.findByRole("treeitem", { name: "Launch plan" })
    fireEvent.click(more(plan))
    expect(more(plan).getAttribute("aria-label")).toBe("More for Launch plan")
    expect(screen.queryByRole("menu")).toBeNull()
    await act(async () => menu.land())
    expect(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Move to trash" })).toBeTruthy()
    // The code came once, for the rest and the press both.
    expect(menu.asked).toBe(1)
  })

  it("once its code is in, opens on the first press of another row's ⋯, drawn in the press itself", async () => {
    renderTree()
    const budget = await screen.findByRole("treeitem", { name: "Budget" })
    fireEvent.click(more(budget))
    // No await: the menu is on screen in the press's own render, no "⋯" frame between.
    expect(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Rename" })).toBeTruthy()
  })
})

describe("the bulk bar, only where rows are chosen", () => {
  it("never comes to a tree that doesn't choose rows, whatever a pointer rests on", async () => {
    renderTree()
    fireEvent.pointerOver(await screen.findByRole("treeitem", { name: "Budget" }), { pointerType: "mouse" })
    await rest()
    expect(bar.asked).toBe(0)
  })

  it("comes to a tree that chooses rows when the keyboard comes in, not on a pointer's focus", async () => {
    renderTree({ selectable: true })
    const budget = await screen.findByRole("treeitem", { name: "Budget" })
    fireEvent.pointerDown(budget)
    act(() => budget.focus())
    await act(async () => {})
    expect(bar.asked).toBe(0)
    fireEvent.keyDown(budget, { key: "ArrowUp" })
    act(() => screen.getByRole("treeitem", { name: "Launch plan" }).focus())
    await waitFor(() => expect(bar.asked).toBe(1))
  })
})

describe("a file's preview", () => {
  it("is asked for as a pointer rests on a file's row, as the row is pressed, and as the keyboard reaches it; never for a page's", async () => {
    renderTree()
    const budget = await screen.findByRole("treeitem", { name: "Budget" })
    fireEvent.pointerOver(budget, { pointerType: "mouse" })
    await rest()
    fireEvent.pointerDown(budget)
    expect(preview.warm).not.toHaveBeenCalled()
    const nda = screen.getByRole("treeitem", { name: "nda.pdf" })
    fireEvent.pointerOver(nda, { pointerType: "mouse" })
    await rest()
    expect(preview.warm).toHaveBeenCalledTimes(1)
    fireEvent.pointerDown(nda, { pointerType: "touch" })
    expect(preview.warm).toHaveBeenCalledTimes(2)
    fireEvent.keyDown(budget, { key: "ArrowDown" })
    act(() => nda.focus())
    expect(preview.warm).toHaveBeenCalledTimes(3)
  })
})

describe("the upload's code", () => {
  it("comes while files are dragged over the tree, and what's dropped then uploads", async () => {
    renderTree({ selectable: true, dropRoot: { place: { space: "project:p-1" }, label: "Website relaunch" } })
    const contracts = await screen.findByRole("treeitem", { name: "Contracts" })
    expect(uploads.asked).toBe(0)
    const dataTransfer = { types: ["Files"], files: [new File(["x"], "nda.pdf")], dropEffect: "" }
    fireEvent(contracts, createEvent.dragOver(contracts, { dataTransfer }))
    await waitFor(() => expect(uploads.asked).toBe(1))
    expect(post).not.toHaveBeenCalled()
    fireEvent(contracts, createEvent.drop(contracts, { dataTransfer }))
    await waitFor(() => expect(post).toHaveBeenCalledWith("/doc/files", expect.any(FormData)))
  })
})
