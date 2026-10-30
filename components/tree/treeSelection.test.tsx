import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { SWRConfig } from "swr"

import { SWRMutateBridge } from "@/components/providers/SWRMutateBridge"
import { TreeView } from "@/components/tree/TreeView"
import { useTree, type TreeAdapter, type TreeLevel, type TreeNode } from "@/components/tree/useTree"
import { useTreeSelection } from "@/components/tree/treeSelection"

// Choosing several rows of a tree at once (docs F1: colour or move a
// selection), as ARIA's multi-select tree has it: Space chooses the row with
// focus, ⌘ or Ctrl and a click adds one, Shift and a click takes the run from
// the last one chosen; a plain click still opens a row, except in selection
// mode (a phone's "Select"), where a tap chooses. Selected says itself without
// colour: aria-selected, and a check in the row's box.

type Answer = { level: TreeLevel<TreeNode> }
const TOP = "/t?parent=&limit=100"
const levels: Record<string, Answer> = {}
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: (url: string) => (levels[url] ? Promise.resolve({ data: structuredClone(levels[url]) }) : Promise.reject(new Error(url))) } }))

const node = (id: string, title: string): TreeNode => ({ id, title, hasChildren: false, canEdit: true })
const adapter: TreeAdapter<TreeNode, Answer> = {
  key: (parent, limit) => `/t?parent=${parent ?? ""}&limit=${limit}`,
  isKey: (key) => key.startsWith("/t?"),
  read: (data) => data.level,
  write: (data, nodes, delta) => ({ level: { ...data.level, nodes, count: data.level.count + delta } }),
  move: async () => {},
}

let seen: ReadonlySet<string> = new Set()
const onOpen = vi.fn()
function Harness({ mode = false }: { mode?: boolean }) {
  const tree = useTree(adapter)
  const selection = useTreeSelection()
  seen = selection.selected
  return <TreeView tree={tree} label="Files" placeholder="Untitled" hiddenLabel={(n) => `${n} hidden`} onOpen={onOpen} selection={{ ...selection, mode: mode || selection.mode }} />
}
const renderTree = (mode?: boolean) =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <SWRMutateBridge />
      <Harness mode={mode} />
    </SWRConfig>,
  )
const row = (name: string) => screen.getByRole("treeitem", { name })

beforeEach(() => {
  levels[TOP] = { level: { nodes: [node("a", "Brief"), node("b", "Budget"), node("c", "Contract"), node("d", "Deck")], hidden: 0, count: 4 } }
  onOpen.mockClear()
  seen = new Set()
})
afterEach(cleanup)

describe("a tree you can choose rows in", () => {
  it("says it takes several, and each row whether it is chosen", async () => {
    renderTree()
    await screen.findByRole("treeitem", { name: "Brief" })
    expect(screen.getByRole("tree")).toHaveAttribute("aria-multiselectable", "true")
    expect(row("Brief")).toHaveAttribute("aria-selected", "false")
  })

  it("chooses with Space, adds with ⌘-click, takes a run with Shift-click, and opens on a plain click", async () => {
    renderTree()
    const brief = await screen.findByRole("treeitem", { name: "Brief" })
    act(() => brief.focus())
    fireEvent.keyDown(brief, { key: " " })
    expect([...seen]).toEqual(["a"])
    expect(brief).toHaveAttribute("aria-selected", "true")
    expect(brief.querySelector("[data-tree-check]")).toHaveAttribute("data-checked", "true")

    fireEvent.click(row("Contract"), { metaKey: true })
    expect([...seen].sort()).toEqual(["a", "c"])
    fireEvent.click(row("Deck"), { shiftKey: true })
    expect([...seen].sort()).toEqual(["a", "c", "d"])
    expect(onOpen).not.toHaveBeenCalled()

    fireEvent.click(row("Budget"))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }))
  })

  it("chooses with the row's box, and Escape lets go of them all", async () => {
    renderTree()
    await screen.findByRole("treeitem", { name: "Brief" })
    fireEvent.click(row("Budget").querySelector<HTMLElement>("[data-tree-check]")!)
    expect([...seen]).toEqual(["b"])
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.keyDown(row("Budget"), { key: "Escape" })
    expect([...seen]).toEqual([])
  })

  it("in selection mode, a tap chooses rather than opens", async () => {
    renderTree(true)
    fireEvent.click(await screen.findByRole("treeitem", { name: "Deck" }))
    expect([...seen]).toEqual(["d"])
    expect(onOpen).not.toHaveBeenCalled()
  })
})
