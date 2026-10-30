import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import { SWRMutateBridge } from "@/components/providers/SWRMutateBridge"
import { TreeView } from "@/components/tree/TreeView"
import { useTree, type TreeAdapter, type TreeLevel, type TreeNode } from "@/components/tree/useTree"
import type { TreeMove } from "@/components/tree/treeDnd"

// A small tree: Plans > {Q4, Q3}, Notes, and a page with no name holding two
// pages the viewer can't open. Served from memory through the real SWR cache,
// so a move is seen landing in the cached levels before the server answers.
type Answer = { level: TreeLevel<TreeNode> }

const levels: Record<string, Answer> = {}
const gets = vi.fn((url: string) => {
  const a = levels[url]
  return a ? Promise.resolve({ data: structuredClone(a) }) : Promise.reject(new Error(`no level at ${url}`))
})
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: (url: string) => gets(url) } }))

const node = (id: string, title: string, hasChildren = false, canEdit = true): TreeNode => ({ id, title, hasChildren, canEdit })
// A level reads more than it shows (fluid-06, Fix 2): a page of 50 reads 100.
const TOP = "/t?parent=&limit=100"
const PLANS = "/t?parent=plans&limit=100"

function reset() {
  for (const k of Object.keys(levels)) delete levels[k]
  levels[TOP] = { level: { nodes: [node("plans", "Plans", true), node("notes", "Notes"), node("ideas", "", true)], hidden: 0, count: 3 } }
  levels[PLANS] = { level: { nodes: [node("q4", "Q4"), node("q3", "Q3")], hidden: 0, count: 2 } }
  levels["/t?parent=ideas&limit=100"] = { level: { nodes: [], hidden: 2, count: 0 } }
}

const move = vi.fn<(m: TreeMove) => Promise<void>>()

const adapter: TreeAdapter<TreeNode, Answer> = {
  key: (parent, limit) => `/t?parent=${parent ?? ""}&limit=${limit}`,
  isKey: (key, parent) => key.startsWith("/t?") && (parent === undefined || key.startsWith(`/t?parent=${parent ?? ""}&`)),
  read: (data) => data.level,
  write: (data, nodes, delta) => ({ level: { ...data.level, nodes, count: data.level.count + delta } }),
  move: (m) => move(m),
}

function Harness({ onOpen }: { onOpen?: (n: TreeNode) => void }) {
  const tree = useTree(adapter)
  return <TreeView tree={tree} label="Docs" placeholder="Untitled" hiddenLabel={(n) => `${n} ${n === 1 ? "page" : "pages"} you can't open`} emptyLabel="No pages inside" onOpen={onOpen} />
}

const renderTree = (onOpen?: (n: TreeNode) => void) =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <SWRMutateBridge />
      <Harness onOpen={onOpen} />
    </SWRConfig>,
  )

const row = (name: string) => screen.getByRole("treeitem", { name })
const press = (el: HTMLElement, key: string, mods: Partial<KeyboardEventInit> = {}) => fireEvent.keyDown(el, { key, ...mods })
// jsdom's drag events drop clientY from their init, so it's set on the event.
function dragAt(kind: "dragOver" | "drop", el: HTMLElement, dataTransfer: object, clientY: number) {
  const ev = createEvent[kind](el, { dataTransfer })
  Object.defineProperty(ev, "clientY", { value: clientY })
  fireEvent(el, ev)
}
const order = () => screen.getAllByRole("treeitem").map((el) => el.getAttribute("aria-label"))

beforeEach(() => {
  reset()
  move.mockReset()
  move.mockImplementation(() => new Promise<void>(() => {}))
  gets.mockClear()
})
afterEach(cleanup)

describe("TreeView", () => {
  it("shows a level as treeitems with one tab stop, a nameless page by its placeholder, and pages the viewer can't open as a count", async () => {
    renderTree()
    const plans = await screen.findByRole("treeitem", { name: "Plans" })
    expect(screen.getByRole("tree", { name: "Docs" })).toBeInTheDocument()
    expect(plans).toHaveAttribute("aria-level", "1")
    expect(plans).toHaveAttribute("aria-posinset", "1")
    expect(plans).toHaveAttribute("aria-setsize", "3")
    expect(plans).toHaveAttribute("aria-expanded", "false")
    expect(row("Notes")).not.toHaveAttribute("aria-expanded")
    expect(plans).toHaveAttribute("tabindex", "0")
    expect(row("Notes")).toHaveAttribute("tabindex", "-1")

    fireEvent.click(screen.getByRole("button", { name: "Open Untitled" }))
    expect(await screen.findByText("2 pages you can't open")).toBeInTheDocument()
  })

  it("moves through rows with the arrows, opens and closes with → and ←, and opens a page with Enter", async () => {
    const onOpen = vi.fn()
    renderTree(onOpen)
    const plans = await screen.findByRole("treeitem", { name: "Plans" })
    plans.focus()
    press(plans, "ArrowDown")
    expect(row("Notes")).toHaveFocus()
    press(row("Notes"), "ArrowUp")
    expect(plans).toHaveFocus()

    press(plans, "ArrowRight")
    expect(await screen.findByRole("treeitem", { name: "Q4" })).toHaveAttribute("aria-level", "2")
    expect(plans).toHaveAttribute("aria-expanded", "true")
    press(plans, "ArrowRight")
    expect(row("Q4")).toHaveFocus()
    press(row("Q4"), "ArrowLeft")
    expect(plans).toHaveFocus()
    press(plans, "ArrowLeft")
    await waitFor(() => expect(screen.queryByRole("treeitem", { name: "Q4" })).toBeNull())

    press(plans, "End")
    expect(row("Untitled")).toHaveFocus()
    press(row("Untitled"), "Home")
    expect(plans).toHaveFocus()
    press(plans, "Enter")
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "plans" }))
  })

  it("reorders with ⌥⇧↓ and shows it before the server answers", async () => {
    renderTree()
    press(await screen.findByRole("treeitem", { name: "Notes" }), "ArrowDown", { altKey: true, shiftKey: true })
    expect(move).toHaveBeenLastCalledWith({ id: "notes", to: null, after: "ideas" })
    await waitFor(() => expect(order()).toEqual(["Plans", "Untitled", "Notes"]))
  })

  it("reorders with ⌥⇧↑", async () => {
    renderTree()
    press(await screen.findByRole("treeitem", { name: "Notes" }), "ArrowUp", { altKey: true, shiftKey: true })
    expect(move).toHaveBeenLastCalledWith({ id: "notes", to: null, after: null, place: "first" })
    await waitFor(() => expect(order()).toEqual(["Notes", "Plans", "Untitled"]))
  })

  it("nests with ⌥⇧→ under the row above, and lifts out with ⌥⇧← after the parent", async () => {
    renderTree()
    press(await screen.findByRole("treeitem", { name: "Notes" }), "ArrowRight", { altKey: true, shiftKey: true })
    expect(move).toHaveBeenLastCalledWith({ id: "notes", to: "plans", after: null, place: "last" })
    // Notes leaves the top at once, and Plans opens to show where it went
    // (its level, not read before, comes as the server has it).
    await waitFor(() => expect(order()).toEqual(["Plans", "Q4", "Q3", "Untitled"]))
    press(row("Q3"), "ArrowLeft", { altKey: true, shiftKey: true })
    expect(move).toHaveBeenLastCalledWith({ id: "q3", to: null, after: "plans" })
  })

  it("leaves Tab to move focus out of the tree: it never moves a page", async () => {
    renderTree()
    const notes = await screen.findByRole("treeitem", { name: "Notes" })
    press(notes, "Tab")
    press(notes, "Tab", { shiftKey: true })
    expect(move).not.toHaveBeenCalled()
  })

  it("puts the tree back as the server has it when a move is refused", async () => {
    const failed = vi.fn()
    move.mockRejectedValue(new Error("409"))
    function Failing() {
      const tree = useTree(adapter, { onMoveError: failed })
      return <TreeView tree={tree} label="Docs" placeholder="Untitled" hiddenLabel={(n) => `${n} hidden`} />
    }
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <SWRMutateBridge />
        <Failing />
      </SWRConfig>,
    )
    press(await screen.findByRole("treeitem", { name: "Notes" }), "ArrowDown", { altKey: true, shiftKey: true })
    await waitFor(() => expect(failed).toHaveBeenCalled())
    await waitFor(() => expect(order()).toEqual(["Plans", "Notes", "Untitled"]))
  })

  it("drags a row beside another or into it, never into its own subpages", async () => {
    renderTree()
    const dt = { setData: vi.fn(), getData: vi.fn(), effectAllowed: "", dropEffect: "" }
    fireEvent.dragStart(await screen.findByRole("treeitem", { name: "Notes" }), { dataTransfer: dt })
    // jsdom lays nothing out: a row reads as 0 tall, which the tree takes as 30.
    dragAt("dragOver", row("Untitled"), dt, 29)
    dragAt("drop", row("Untitled"), dt, 29)
    expect(move).toHaveBeenLastCalledWith({ id: "notes", to: null, after: "ideas" })

    fireEvent.dragStart(row("Notes"), { dataTransfer: dt })
    dragAt("dragOver", row("Plans"), dt, 15)
    dragAt("drop", row("Plans"), dt, 15)
    expect(move).toHaveBeenLastCalledWith({ id: "notes", to: "plans", after: null, place: "last" })

    const q4 = await screen.findByRole("treeitem", { name: "Q4" })
    move.mockClear()
    fireEvent.dragStart(row("Plans"), { dataTransfer: dt })
    dragAt("dragOver", q4, dt, 15)
    dragAt("drop", q4, dt, 15)
    expect(move).not.toHaveBeenCalled()
  })

  it("never puts a row inside a leaf (a file, a link): a drop on one lands beside it, and ⌥⇧→ under one does nothing", async () => {
    levels[TOP] = { level: { nodes: [{ ...node("brief", "brief.pdf"), leaf: true }, node("notes", "Notes")], hidden: 0, count: 2 } }
    renderTree()
    const notes = await screen.findByRole("treeitem", { name: "Notes" })
    press(notes, "ArrowRight", { altKey: true, shiftKey: true })
    expect(move).not.toHaveBeenCalled()
    const dt = { setData: vi.fn(), getData: vi.fn(), effectAllowed: "", dropEffect: "" }
    fireEvent.dragStart(notes, { dataTransfer: dt })
    // A third of the way down, which would drop inside a page.
    dragAt("dragOver", row("brief.pdf"), dt, 10)
    dragAt("drop", row("brief.pdf"), dt, 10)
    expect(move).toHaveBeenLastCalledWith({ id: "notes", to: null, after: null, place: "first" })
  })

  it("draws a folder's contents from the folder down, and lifts a row out of it to sit after the folder", async () => {
    levels["/t?parent=plans&limit=100"] = { level: { nodes: [node("q4", "Q4"), node("q3", "Q3")], hidden: 0, count: 2 } }
    function Rooted({ parent }: { parent?: string }) {
      const tree = useTree(adapter)
      return <TreeView tree={tree} label="Plans" placeholder="Untitled" hiddenLabel={(n) => `${n} hidden`} root={{ id: "plans", parent }} />
    }
    const { unmount } = render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <SWRMutateBridge />
        <Rooted parent="space-folder" />
      </SWRConfig>,
    )
    const q3 = await screen.findByRole("treeitem", { name: "Q3" })
    expect(q3).toHaveAttribute("aria-level", "1")
    expect(screen.queryByRole("treeitem", { name: "Plans" })).toBeNull()
    press(q3, "ArrowUp", { altKey: true, shiftKey: true })
    expect(move).toHaveBeenLastCalledWith({ id: "q3", to: "plans", after: null, place: "first" })
    press(row("Q4"), "ArrowLeft", { altKey: true, shiftKey: true })
    expect(move).toHaveBeenLastCalledWith({ id: "q4", to: "space-folder", after: "plans" })
    unmount()

    // A folder at the top of its space: where "out" goes isn't known here, so ⌥⇧← does nothing.
    move.mockClear()
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <SWRMutateBridge />
        <Rooted />
      </SWRConfig>,
    )
    press(await screen.findByRole("treeitem", { name: "Q4" }), "ArrowLeft", { altKey: true, shiftKey: true })
    expect(move).not.toHaveBeenCalled()
  })

  it("shows a row's line of detail after its title (a link's site, a file's size)", async () => {
    function WithMeta() {
      const tree = useTree(adapter)
      return <TreeView tree={tree} label="Docs" placeholder="Untitled" hiddenLabel={(n) => `${n} hidden`} meta={(n) => (n.id === "notes" ? "figma.com" : null)} />
    }
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <SWRMutateBridge />
        <WithMeta />
      </SWRConfig>,
    )
    const notes = await screen.findByRole("treeitem", { name: "Notes" })
    expect(notes.querySelector("[data-tree-meta]")?.textContent).toBe("figma.com")
    expect(row("Plans").querySelector("[data-tree-meta]")).toBeNull()
  })

  // The shared long press (hooks/useLongPress): the click a hold's release
  // sends is swallowed wherever it lands. A menu sheet grows to 92dvh, so by
  // then it is usually the sheet's own item under the finger, which ran (a
  // row's Select, a file's Versions) and closed the sheet it had just opened.
  it("opens a row's menu on a long press under a finger, and its release clicks nothing, on the row or on the sheet over it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const item = document.body.appendChild(document.createElement("button"))
    try {
      const onOpen = vi.fn()
      const onLongPress = vi.fn()
      const ran = vi.fn()
      item.addEventListener("click", ran)
      function Held() {
        const tree = useTree(adapter)
        return <TreeView tree={tree} label="Docs" placeholder="Untitled" hiddenLabel={(n) => `${n} hidden`} onOpen={onOpen} onLongPress={onLongPress} />
      }
      render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
          <SWRMutateBridge />
          <Held />
        </SWRConfig>,
      )
      const notes = await screen.findByRole("treeitem", { name: "Notes" })
      const finger = { touches: [{ clientX: 120, clientY: 12 }] }
      fireEvent.touchStart(notes, finger)
      await act(async () => void vi.advanceTimersByTime(600))
      expect(onLongPress).toHaveBeenCalledWith(expect.objectContaining({ id: "notes" }))
      fireEvent.touchEnd(notes)
      fireEvent.click(item)
      expect(ran).not.toHaveBeenCalled()
      fireEvent.touchStart(notes, finger)
      await act(async () => void vi.advanceTimersByTime(600))
      fireEvent.touchEnd(notes)
      fireEvent.click(notes)
      expect(onOpen).not.toHaveBeenCalled()
      // A tap is a tap.
      fireEvent.touchStart(notes, finger)
      fireEvent.touchEnd(notes)
      fireEvent.click(notes)
      expect(onOpen).toHaveBeenCalledTimes(1)
      // A list scrolling under a still finger makes it a scroll, not a hold.
      onLongPress.mockClear()
      fireEvent.touchStart(notes, finger)
      fireEvent.scroll(window)
      await act(async () => void vi.advanceTimersByTime(600))
      expect(onLongPress).not.toHaveBeenCalled()
      fireEvent.touchEnd(notes)
    } finally {
      item.remove()
      vi.useRealTimers()
    }
  })

  it("says a level couldn't load, with a way to try again, rather than showing it empty", async () => {
    delete levels[PLANS]
    renderTree()
    press(await screen.findByRole("treeitem", { name: "Plans" }), "ArrowRight")
    expect(await screen.findByText("Couldn't load these.")).toBeInTheDocument()
    expect(screen.queryByText("No pages inside")).toBeNull()
    levels[PLANS] = { level: { nodes: [node("q4", "Q4")], hidden: 0, count: 1 } }
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    expect(await screen.findByRole("treeitem", { name: "Q4" })).toBeInTheDocument()
  })
})
