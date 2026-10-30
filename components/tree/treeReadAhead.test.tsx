import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"

import { SWRMutateBridge } from "@/components/providers/SWRMutateBridge"
import { TreeView } from "@/components/tree/TreeView"
import { pauseReadAhead, pauseReadAheadWhileOpening, useTree, type TreeAdapter, type TreeLevel, type TreeNode } from "@/components/tree/useTree"

// fluid-06, Fix 2: a level is read ahead. Its first read asks for more than
// it shows, so "Show N more" needs no round trip; a row's children are read
// when the pointer rests on it, when it has focus, and, for the rows on
// screen that hold others, while the page is idle; what comes back is put
// where the level will look (the tree's cache), so opening the row shows them
// at once. On beta a chevron waited for its read: 181 ms on a computer.

type Answer = { level: TreeLevel<TreeNode> }
const gets: string[] = []
const top = Array.from({ length: 40 }, (_, i): TreeNode => ({ id: `p${i}`, title: `Page ${i}`, hasChildren: i === 0 || i === 1, canEdit: true }))
const kids = (parent: string) => Array.from({ length: 3 }, (_, i): TreeNode => ({ id: `${parent}-${i}`, title: `${parent} child ${i}`, hasChildren: false, canEdit: true }))
function answer(url: string): Answer {
  const q = new URL(url, "http://x").searchParams
  const parent = q.get("parent") ?? ""
  const limit = Number(q.get("limit"))
  const all = parent ? kids(parent) : top
  return { level: { nodes: all.slice(0, limit), hidden: 0, count: all.length } }
}
// A read of p1's children can be held on its way (slow), until it is cancelled.
const slow = { on: false, signals: [] as AbortSignal[] }
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: {
    get: async (url: string, config?: { signal?: AbortSignal }) => {
      gets.push(url)
      if (slow.on && url.includes("parent=p1&") && config?.signal) {
        const signal = config.signal
        slow.signals.push(signal)
        return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("cancelled"))))
      }
      return { data: answer(url) }
    },
  },
}))
const idle: Array<() => void> = []
vi.mock("@/lib/whenIdle", () => ({ whenIdle: (run: () => void) => (idle.push(run), () => {}) }))

const adapter: TreeAdapter<TreeNode, Answer> = {
  key: (parent, limit) => `/t?parent=${parent ?? ""}&limit=${limit}`,
  isKey: (key, parent) => key.startsWith("/t?") && (parent === undefined || key.startsWith(`/t?parent=${parent ?? ""}&`)),
  read: (data) => data.level,
  write: (data, nodes, delta) => ({ level: { ...data.level, nodes, count: data.level.count + delta } }),
  move: async () => {},
}
function Harness() {
  const tree = useTree(adapter, { pageSize: 5 })
  return <TreeView tree={tree} label="Pages" placeholder="Untitled" hiddenLabel={(n) => `${n} hidden`} />
}
const show = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <SWRMutateBridge />
      <Harness />
    </SWRConfig>,
  )
const asked = (parent: string) => gets.filter((u) => u.startsWith(`/t?parent=${parent}&`))

beforeEach(() => {
  gets.length = 0
  idle.length = 0
  slow.on = false
  slow.signals.length = 0
})
afterEach(cleanup)

describe("a level read ahead (fluid-06, Fix 2)", () => {
  it("reads more than it shows, so Show more needs no round trip", async () => {
    show()
    await screen.findByRole("treeitem", { name: "Page 0" })
    expect(screen.getAllByRole("treeitem")).toHaveLength(5)
    const before = asked("").length
    expect(before).toBe(1)
    fireEvent.click(screen.getByRole("button", { name: "Show 35 more" }))
    expect(screen.getAllByRole("treeitem")).toHaveLength(40)
    expect(asked("")).toHaveLength(before)
  })

  it("reads a row's children when the pointer rests on it, and opens it from them at once", async () => {
    show()
    const row = await screen.findByRole("treeitem", { name: "Page 0" })
    fireEvent.pointerEnter(row, { pointerType: "mouse" })
    await waitFor(() => expect(asked("p0")).toHaveLength(1))
    // Its children are in the cache: the chevron shows them with no wait.
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Open Page 0" })))
    expect(screen.getByRole("treeitem", { name: "p0 child 0" })).toBeTruthy()
    expect(asked("p0")).toHaveLength(1)
  })

  it("reads a row's children when it has focus", async () => {
    show()
    const row = await screen.findByRole("treeitem", { name: "Page 1" })
    act(() => row.focus())
    await waitFor(() => expect(asked("p1")).toHaveLength(1))
  })

  it("reads the children of the rows on screen that hold others while the page is idle", async () => {
    show()
    await screen.findByRole("treeitem", { name: "Page 0" })
    expect(asked("p0")).toHaveLength(0)
    await act(async () => idle.splice(0).forEach((run) => run()))
    await waitFor(() => expect([asked("p0").length, asked("p1").length]).toEqual([1, 1]))
    // Rows that hold nothing are never asked about.
    expect(gets.filter((u) => /parent=p[2-9]/.test(u))).toEqual([])
  })
})

// DOCS-LEAD-2, fluid-06: a doc opened from a tree asks for its page, its data
// and its code; a level read ahead then only competes with them.
describe("read-ahead waits while a doc opens", () => {
  const idleReads = () => act(async () => idle.splice(0).forEach((run) => run()))

  it("holds what it would read ahead, and reads it once the doc has opened", async () => {
    show()
    await screen.findByRole("treeitem", { name: "Page 0" })
    const resume = pauseReadAhead()
    await idleReads()
    expect([asked("p0").length, asked("p1").length]).toEqual([0, 0])
    await act(async () => resume())
    await waitFor(() => expect([asked("p0").length, asked("p1").length]).toEqual([1, 1]))
  })

  it("cancels a read on its way, and reads it again once the doc has opened", async () => {
    slow.on = true
    show()
    await screen.findByRole("treeitem", { name: "Page 0" })
    await idleReads()
    await waitFor(() => expect(slow.signals).toHaveLength(1))
    expect(slow.signals[0].aborted).toBe(false)
    slow.on = false
    const resume = pauseReadAhead()
    expect(slow.signals[0].aborted).toBe(true)
    // Cancelled, it is held: nothing more is asked while the doc opens.
    await act(async () => {})
    expect(asked("p1")).toHaveLength(1)
    await act(async () => resume())
    await waitFor(() => expect(asked("p1")).toHaveLength(2))
    // And what came back is where the level will look: opening the row asks nothing more.
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Open Page 1" })))
    expect(screen.getByRole("treeitem", { name: "p1 child 0" })).toBeTruthy()
    expect(asked("p1")).toHaveLength(2)
  })

  it("holds it while two docs open, until the second has opened", async () => {
    show()
    await screen.findByRole("treeitem", { name: "Page 0" })
    const first = pauseReadAhead()
    const second = pauseReadAhead()
    await idleReads()
    first()
    first()
    await act(async () => {})
    expect(asked("p0")).toHaveLength(0)
    await act(async () => second())
    await waitFor(() => expect(asked("p0")).toHaveLength(1))
  })

  it("opening a doc holds it for a second, then until the browser is quiet", async () => {
    show()
    await screen.findByRole("treeitem", { name: "Page 0" })
    vi.useFakeTimers({ toFake: ["setTimeout"] })
    try {
      pauseReadAheadWhileOpening()
      await idleReads()
      vi.advanceTimersByTime(999)
      expect(idle).toHaveLength(0)
      vi.advanceTimersByTime(1)
      // The second is up: the pause ends at the browser's first quiet moment.
      expect(idle).toHaveLength(1)
      expect(asked("p0")).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
    await idleReads()
    await waitFor(() => expect([asked("p0").length, asked("p1").length]).toEqual([1, 1]))
  })
})
