// The render counter goes first: React must find its hook as it starts.
import { renders, resetRenders } from "@/components/tree/treeTestKit"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { SWRConfig } from "swr"

import { SWRMutateBridge } from "@/components/providers/SWRMutateBridge"
import { TreeView } from "@/components/tree/TreeView"
import { useTree, type TreeAdapter, type TreeLevel, type TreeNode } from "@/components/tree/useTree"

// fluid-06, Fix 1 (FLUIDITY-LEAD-3's budgets, pages-budgets.json): a tree's
// rows hold. A key that moves focus renders the two rows it moved between,
// not the tree (beta rendered about 5,000 components a down-arrow on a tree
// of 2,281 pages). Each row reads whether it is focused, open, the current
// place or chosen as its own boolean, so only the rows whose boolean changed
// render again.

type Answer = { level: TreeLevel<TreeNode> }
const levels: Record<string, Answer> = {}
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: (url: string) => (levels[url] ? Promise.resolve({ data: structuredClone(levels[url]) }) : Promise.reject(new Error(url))) } }))

const node = (id: string, title: string, hasChildren = false): TreeNode => ({ id, title, hasChildren, canEdit: true })
const adapter: TreeAdapter<TreeNode, Answer> = {
  key: (parent, limit) => `/t?parent=${parent ?? ""}&limit=${limit}`,
  isKey: (key, parent) => key.startsWith("/t?") && (parent === undefined || key.startsWith(`/t?parent=${parent ?? ""}&`)),
  read: (data) => data.level,
  write: (data, nodes, delta) => ({ level: { ...data.level, nodes, count: data.level.count + delta } }),
  move: async () => {},
}

function Harness() {
  const tree = useTree(adapter)
  return <TreeView tree={tree} label="Pages" placeholder="Untitled" hiddenLabel={(n) => `${n} hidden`} />
}

beforeEach(() => {
  for (const k of Object.keys(levels)) delete levels[k]
})
afterEach(cleanup)

describe("a tree's rows hold (fluid-06, Fix 1)", () => {
  it("renders the two rows focus moved between on a down-arrow, of fifty", async () => {
    const rows = Array.from({ length: 50 }, (_, i) => node(`p${i}`, `Page ${i}`, i % 3 === 0))
    for (const limit of [50, 100]) levels[`/t?parent=&limit=${limit}`] = { level: { nodes: rows, hidden: 0, count: 50 } }
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <SWRMutateBridge />
        <Harness />
      </SWRConfig>,
    )
    const first = await screen.findByRole("treeitem", { name: "Page 0" })
    act(() => first.focus())
    resetRenders()
    act(() => void fireEvent.keyDown(first, { key: "ArrowDown" }))
    expect(screen.getByRole("treeitem", { name: "Page 1" })).toHaveFocus()
    const r = renders()
    expect(r.of("TreeRow"), `rows rendered: ${JSON.stringify(r.top())}`).toBeLessThanOrEqual(2)
    expect(r.total, `renders on a key: ${JSON.stringify(r.top())}`).toBeLessThanOrEqual(10)
  })
})
