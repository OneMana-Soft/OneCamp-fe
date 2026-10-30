import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import type { Connected, GraphPaths } from "@/lib/workGraph/workGraph"
import { markOfRow, nodeGlyph, nodeHue } from "@/components/docFiles/NodeMark"
import type { TreeNodeJSON } from "@/types/docGraph"

/** What each key answers: data, an error, or still loading. isPrevious: the data is the last key's, kept on screen by SWR. */
type Answer = { data?: unknown; isError?: unknown; isLoading?: boolean; isPrevious?: boolean }
const answers = new Map<string, Answer>()
const asked: string[] = []
const mutate = vi.fn(() => Promise.resolve())

vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => {
    if (key) asked.push(key)
    const a = (key && answers.get(key)) || (key ? { isLoading: true } : {})
    return { data: a.data, isError: a.isError, isLoading: !!a.isLoading, isPrevious: !!a.isPrevious, mutate }
  },
}))
vi.mock("@/components/navigationBar/desktop/IntentLink", () => ({
  IntentLink: React.forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>(function L(p, ref) {
    return <a ref={ref} {...p} />
  }),
}))

vi.mock("@/components/message/chatFace", () => ({ ChatFace: ({ name }: { name: string }) => <span data-face="">{name[0]}</span> }))

import { ConnectedList } from "./ConnectedList"
import { ConnectionFinder } from "./ConnectionFinder"

afterEach(() => {
  cleanup()
  answers.clear()
  asked.length = 0
  vi.useRealTimers()
})

const task = { rel: "linked_from", kind: "task" as const, id: "t1", title: "Record the film" }
const proj = { rel: "in_project", kind: "project" as const, id: "p1", title: "Launch" }
const sam = { rel: "created_by", kind: "person" as const, id: "u1", title: "Sam Rivera" }
const connected: Connected = {
  root: { rel: "", kind: "doc", id: "d1", title: "Plan" },
  depth: 2,
  groups: [
    { kind: "task", items: [{ ...task, depth: 1, path: [task] }], more: false },
    { kind: "project", items: [{ ...proj, depth: 2, path: [task, proj] }], more: false },
    { kind: "person", items: [{ ...sam, depth: 1, path: [sam] }], more: true },
  ],
}
const KEY2 = "/graph/connected?kind=doc&uuid=d1&depth=2"
const KEY1 = "/graph/connected?kind=doc&uuid=d1&depth=1"

describe("the Connected panel's list", () => {
  it("groups what's connected, each row opening where it lives and saying why", () => {
    answers.set(KEY2, { data: { data: connected } })
    const onRoot = vi.fn()
    render(<ConnectedList kind="doc" id="d1" onRoot={onRoot} />)
    const project = screen.getByRole("link", { name: /Launch/ })
    expect(project.getAttribute("href")).toBe("/app/project/p1")
    expect(project.textContent).toContain("Its project · via Record the film")
    expect(screen.getByRole("region", { name: "People, 1 or more" })).toBeTruthy()
    expect(screen.getByRole("status").textContent).toBe("3+ connected")
    expect(onRoot).toHaveBeenCalledWith("Plan")
    // Rows carry their kind's hue through the interaction layer.
    expect(project.getAttribute("data-hue")).toBe("moss")
    // People are no area: no hue, and their own face, as Who knows draws them.
    const person = screen.getByRole("link", { name: /Sam Rivera/ })
    expect(person.getAttribute("data-hue")).toBeNull()
    expect(person.querySelector("[data-face]")).toBeTruthy()
    expect(person.querySelector("[data-graph-tile]")).toBeNull()
    expect(project.querySelector("[data-graph-tile]")).toBeTruthy()
    // The kind chips wrap onto a second line rather than run off the panel's edge.
    expect(screen.getByRole("radiogroup", { name: "Show" }).className).toContain("flex-wrap")
  })

  it("narrows to one kind, and looks one step out on Direct", () => {
    answers.set(KEY2, { data: { data: connected } })
    answers.set(KEY1, { data: { data: { ...connected, groups: connected.groups.slice(0, 1) } } })
    render(<ConnectedList kind="doc" id="d1" />)
    fireEvent.click(screen.getByRole("radio", { name: "Tasks" }))
    expect(screen.queryByRole("link", { name: /Launch/ })).toBeNull()
    expect(screen.getByRole("radio", { name: "Tasks" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("radio", { name: "All" }).getAttribute("aria-checked")).toBe("false")
    fireEvent.click(screen.getByRole("radio", { name: "Direct" }))
    expect(asked).toContain(KEY1)
  })

  it("moves through rows with the arrow keys and wraps", () => {
    answers.set(KEY2, { data: { data: connected } })
    render(<ConnectedList kind="doc" id="d1" />)
    const rows = screen.getAllByRole("link")
    rows[0].focus()
    fireEvent.keyDown(rows[0], { key: "ArrowDown" })
    expect(document.activeElement).toBe(rows[1])
    fireEvent.keyDown(rows[1], { key: "End" })
    expect(document.activeElement).toBe(rows[rows.length - 1])
    fireEvent.keyDown(rows[rows.length - 1], { key: "ArrowDown" })
    expect(document.activeElement).toBe(rows[0])
  })

  it("says loading while it loads", () => {
    render(<ConnectedList kind="doc" id="d1" />)
    expect(screen.getByRole("status", { name: "Loading what this connects to" })).toBeTruthy()
  })

  it("says a failure is a failure, with Try again, never that nothing is connected", () => {
    answers.set(KEY2, { isError: new Error("boom") })
    render(<ConnectedList kind="doc" id="d1" />)
    expect(screen.queryByText("Nothing connected yet")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }))
    expect(mutate).toHaveBeenCalled()
  })

  it("says a failed read on Direct is a failure, never the two-step list kept from before", () => {
    answers.set(KEY2, { data: { data: connected } })
    render(<ConnectedList kind="doc" id="d1" />)
    expect(screen.getByRole("link", { name: /Launch/ })).toBeTruthy()
    answers.set(KEY1, { data: { data: connected }, isError: new Error("boom"), isPrevious: true })
    fireEvent.click(screen.getByRole("radio", { name: "Direct" }))
    expect(screen.queryByRole("link", { name: /Launch/ })).toBeNull()
    expect(screen.getByRole("button", { name: /Try again/ })).toBeTruthy()
  })

  // lib/http/loadFailure: a 403 is no access, and a 400, 404 or 410 is gone.
  // Neither is a failure Try again can fix.
  it.each([403, 400, 404, 410])("says a %i is a thing the reader can't see, with nothing to retry or switch", (status) => {
    answers.set(KEY2, { isError: { response: { status } } })
    const onHidden = vi.fn()
    render(<ConnectedList kind="doc" id="d1" onHidden={onHidden} />)
    expect(screen.getByText("You can't see what this connects to")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull()
    expect(screen.queryByRole("radiogroup", { name: "How far to look" })).toBeNull()
    expect(onHidden).toHaveBeenLastCalledWith(true)
  })

  it("says nothing is connected yet, and what would connect it", () => {
    answers.set(KEY2, { data: { data: { ...connected, groups: [] } } })
    render(<ConnectedList kind="doc" id="d1" />)
    expect(screen.getByRole("heading", { name: "Nothing connected yet" })).toBeTruthy()
  })
})

describe("a folder, a file and a link (docs F1)", () => {
  // Plan sits in Finance (no colour), which holds a sheet and a coloured
  // page; Plan holds a coloured link.
  const folder = { rel: "in_folder", kind: "doc" as const, id: "f1", title: "Finance", data: { node_kind: "folder" } }
  const sheet = { rel: "contains", kind: "doc" as const, id: "q3", title: "Q3 budget.xlsx", data: { node_kind: "file" } }
  const notes = { rel: "contains", kind: "doc" as const, id: "n1", title: "Budget notes", data: { color: "berry" } }
  const link = { rel: "holds", kind: "doc" as const, id: "l1", title: "Forecast", data: { node_kind: "link", color: "sky" } }
  const inFolder: Connected = {
    root: { rel: "", kind: "doc", id: "d1", title: "Plan" },
    depth: 2,
    groups: [
      {
        kind: "doc",
        items: [
          { ...folder, depth: 1, path: [folder] },
          { ...link, depth: 1, path: [link] },
          { ...sheet, depth: 2, path: [folder, sheet] },
          { ...notes, depth: 2, path: [folder, notes] },
        ],
        more: false,
      },
    ],
  }

  it("marks each by what it is, in its colour or its file type's hue, and says why it's here", () => {
    answers.set(KEY2, { data: { data: inFolder } })
    render(<ConnectedList kind="doc" id="d1" />)
    const row = (name: RegExp) => screen.getByRole("link", { name })
    const tile = (a: HTMLElement) => a.querySelector<HTMLElement>("[data-graph-tile]")!
    // An uncoloured folder is ink, as the docs tree marks it: no hue.
    const f = row(/^Finance, Its folder$/)
    expect(tile(f).getAttribute("data-node-kind")).toBe("folder")
    expect(f.getAttribute("data-hue")).toBeNull()
    // A file wears its type: a .xlsx is a sheet, in the sheets' moss. It
    // shares Plan's folder, so it's in the same folder.
    const s = row(/^Q3 budget\.xlsx, In the same folder · via Finance$/)
    expect(tile(s).getAttribute("data-node-kind")).toBe("file")
    expect(tile(s).getAttribute("data-file-kind")).toBe("sheet")
    expect(s.getAttribute("data-hue")).toBe("moss")
    // A link with a colour takes it, and a page held by a page reads "In this page".
    const l = row(/^Forecast, In this page$/)
    expect(tile(l).getAttribute("data-node-kind")).toBe("link")
    expect(l.getAttribute("data-hue")).toBe("sky")
    // A coloured page keeps a page's mark, in its colour.
    const n = row(/^Budget notes, In the same folder · via Finance$/)
    expect(tile(n).getAttribute("data-node-kind")).toBeNull()
    expect(n.getAttribute("data-hue")).toBe("berry")
    // Every one opens as a doc, and one Docs group holds them all.
    expect([f, s, l, n].map((a) => a.getAttribute("href"))).toEqual(["/app/doc/f1", "/app/doc/q3", "/app/doc/l1", "/app/doc/n1"])
    expect(screen.getAllByRole("region")).toHaveLength(1)
  })

  it("marks a node as the docs tree marks it: one rule for a link's family and a page's own hue", () => {
    // The tree reads a link's address; the chip names only its provider's
    // family (DGRAPH-LEAD-5). An uncoloured page takes its own hue, not the
    // docs area's.
    const sheetLink = { rel: "holds", kind: "doc" as const, id: "l2", title: "Forecast sheet", data: { node_kind: "link", link_family: "sheet" } }
    const page = { rel: "holds", kind: "doc" as const, id: "p7", title: "Retro notes", data: {} }
    const rowOf = (n: Partial<TreeNodeJSON>): TreeNodeJSON => ({ kind: "doc", has_children: false, ...n })
    const tree = {
      sheetLink: markOfRow(rowOf({ uuid: "l2", node_kind: "link", link_url: "https://docs.google.com/spreadsheets/d/1/edit" })),
      page: markOfRow(rowOf({ uuid: "p7" })),
    }
    answers.set(KEY2, {
      data: { data: { root: { rel: "", kind: "doc", id: "d1", title: "Plan" }, depth: 2, groups: [{ kind: "doc", items: [sheetLink, page].map((h) => ({ ...h, depth: 1, path: [h] })), more: false }] } },
    })
    render(<ConnectedList kind="doc" id="d1" />)
    const glyphOf = (el: Element) => el.querySelector("[data-graph-tile] svg")!.getAttribute("class")
    const drawn = (Glyph: React.ComponentType) => {
      const { container, unmount } = render(<Glyph />)
      const cls = container.querySelector("svg")!.getAttribute("class")
      unmount()
      return cls
    }
    for (const [name, node] of [
      [/^Forecast sheet,/, tree.sheetLink],
      [/^Retro notes,/, tree.page],
    ] as const) {
      const row = screen.getByRole("link", { name })
      expect(row.getAttribute("data-hue")).toBe(nodeHue(node))
      expect(glyphOf(row)).toBe(drawn(nodeGlyph(node)))
    }
    expect(nodeHue(tree.sheetLink)).toBe("moss")
    expect(nodeHue(tree.page)).not.toBeNull()
  })

  it("words a way through a folder by what each step is", () => {
    vi.useFakeTimers()
    answers.set(`/search/unifiedSearch/${encodeURIComponent("lau")}`, { data: { data: { page: [{ type: "project", project: { project_id: "p1", project_name: "Launch" } }] } } })
    const linked = { rel: "linked_from", kind: "project" as const, id: "p1", title: "Launch" }
    const paths: GraphPaths = { from: inFolder.root, to: { rel: "", kind: "project", id: "p1", title: "Launch" }, paths: [{ hops: [folder, sheet, linked] }] }
    answers.set("/graph/path?from_kind=doc&from=d1&to_kind=project&to=p1", { data: { data: paths } })
    render(<ConnectionFinder kind="doc" id="d1" subject="Plan" />)
    fireEvent.change(screen.getByRole("searchbox", { name: "Find something to connect to" }), { target: { value: "lau" } })
    act(() => {
      vi.advanceTimersByTime(250)
    })
    fireEvent.click(screen.getAllByRole("option")[0])
    const way = screen.getByRole("region", { name: /^Way 1: Plan is in the folder Finance contains Q3 budget\.xlsx is linked from Launch$/ })
    expect(within(way).getByText("is in the folder")).toBeTruthy()
    expect(within(way).getByRole("link", { name: "Finance, Folder" })).toBeTruthy()
    expect(within(way).getByRole("link", { name: "Q3 budget.xlsx, File" })).toBeTruthy()
    expect(within(way).getByRole("link", { name: "Launch, Project" })).toBeTruthy()
  })
})

describe("How is this connected to…", () => {
  const search = (q: string) => `/search/unifiedSearch/${encodeURIComponent(q)}`
  const pathOf = "/graph/path?from_kind=doc&from=d1&to_kind=project&to=p1"

  function typeAndSettle(text: string) {
    fireEvent.change(screen.getByRole("searchbox", { name: "Find something to connect to" }), { target: { value: text } })
    act(() => {
      vi.advanceTimersByTime(250)
    })
  }

  it("goes from the field to the first thing found with ↓", () => {
    vi.useFakeTimers()
    answers.set(search("lau"), { data: { data: { page: [{ type: "project", project: { project_id: "p1", project_name: "Launch" } }] } } })
    render(<ConnectionFinder kind="doc" id="d1" subject="Plan" />)
    typeAndSettle("lau")
    fireEvent.keyDown(screen.getByRole("searchbox", { name: "Find something to connect to" }), { key: "ArrowDown" })
    expect(document.activeElement).toBe(screen.getAllByRole("option")[0])
  })

  it("finds a thing and shows each way it connects, step by step", () => {
    vi.useFakeTimers()
    answers.set(search("lau"), { data: { data: { page: [{ type: "project", project: { project_id: "p1", project_name: "Launch" } }, { type: "doc", doc: { doc_uuid: "d1", doc_title: "Plan" } }] } } })
    const paths: GraphPaths = { from: connected.root, to: { rel: "", kind: "project", id: "p1", title: "Launch" }, paths: [{ hops: [task, proj] }] }
    answers.set(pathOf, { data: { data: paths } })
    render(<ConnectionFinder kind="doc" id="d1" subject="Plan" />)
    expect(screen.getByText("Find anything to connect to")).toBeTruthy()
    typeAndSettle("lau")
    const options = screen.getAllByRole("option")
    // The doc itself is never offered.
    expect(options).toHaveLength(1)
    fireEvent.click(options[0])
    const way = screen.getByRole("region", { name: /^Way 1: Plan is linked from Record the film is in Launch$/ })
    expect(within(way).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/app/doc/d1", "/app/task/t1", "/app/project/p1"])
    expect(within(way).getByText("is linked from")).toBeTruthy()
    expect(screen.getByText("One way they connect")).toBeTruthy()
  })

  it("keeps focus in the panel after a pick, on the result's first control", () => {
    vi.useFakeTimers()
    answers.set(search("lau"), { data: { data: { page: [{ type: "project", project: { project_id: "p1", project_name: "Launch" } }] } } })
    answers.set(pathOf, { data: { data: { from: connected.root, to: { rel: "", kind: "project", id: "p1", title: "Launch" }, paths: [{ hops: [task, proj] }] } } })
    render(<ConnectionFinder kind="doc" id="d1" subject="Plan" />)
    typeAndSettle("lau")
    const option = screen.getByRole("option")
    option.focus()
    fireEvent.click(option)
    // The picked row is gone; focus isn't left on the page, where a key would miss the panel.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Choose something else" }))
  })

  it("says plainly when nothing the reader can see connects them", () => {
    vi.useFakeTimers()
    answers.set(search("lau"), { data: { data: { page: [{ type: "project", project: { project_uuid: "p1", project_name: "Launch" } }] } } })
    answers.set(pathOf, { data: { data: { from: connected.root, to: proj, paths: [] } } })
    render(<ConnectionFinder kind="doc" id="d1" subject="Plan" />)
    typeAndSettle("lau")
    fireEvent.click(screen.getByRole("option"))
    expect(screen.getByText("Not connected within four steps")).toBeTruthy()
    // Choosing something else goes back to the search.
    fireEvent.click(screen.getByRole("button", { name: "Choose something else" }))
    expect(screen.getByRole("searchbox")).toBeTruthy()
  })

  it.each([403, 400, 404])("says a %i is one the reader can't open, with nothing to retry", (status) => {
    vi.useFakeTimers()
    answers.set(search("lau"), { data: { data: { page: [{ type: "project", project: { project_id: "p1", project_name: "Launch" } }] } } })
    answers.set(pathOf, { isError: { response: { status } } })
    render(<ConnectionFinder kind="doc" id="d1" subject="Plan" />)
    typeAndSettle("lau")
    fireEvent.click(screen.getByRole("option"))
    expect(screen.getByText("You can't open that")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull()
  })

  it("offers Try again when finding the ways failed", () => {
    vi.useFakeTimers()
    answers.set(search("lau"), { data: { data: { page: [{ type: "project", project: { project_id: "p1", project_name: "Launch" } }] } } })
    answers.set(pathOf, { isError: { response: { status: 503 } } })
    render(<ConnectionFinder kind="doc" id="d1" subject="Plan" />)
    typeAndSettle("lau")
    fireEvent.click(screen.getByRole("option"))
    mutate.mockClear()
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }))
    expect(mutate).toHaveBeenCalled()
  })

  it("says a failed search is a failure, never the last words' finds as picks for these", () => {
    vi.useFakeTimers()
    const launch = { data: { data: { page: [{ type: "project", project: { project_id: "p1", project_name: "Launch" } }] } } }
    answers.set(search("lau"), launch)
    render(<ConnectionFinder kind="doc" id="d1" subject="Plan" />)
    typeAndSettle("lau")
    expect(screen.getAllByRole("option")).toHaveLength(1)
    answers.set(search("lax"), { ...launch, isError: new Error("offline"), isPrevious: true })
    typeAndSettle("lax")
    expect(screen.queryAllByRole("option")).toHaveLength(0)
    expect(screen.getByRole("button", { name: /Try again/ })).toBeTruthy()
  })

  it("says when nothing was found", () => {
    vi.useFakeTimers()
    answers.set(search("zzz"), { data: { data: { page: [] } } })
    render(<ConnectionFinder kind="doc" id="d1" subject="Plan" />)
    typeAndSettle("zzz")
    expect(screen.getByText("Nothing found for “zzz”")).toBeTruthy()
  })
})

describe("LazyConnected: the button from its own chunk", () => {
  it("holds the button's slot at its size while it loads, then draws the button in it", async () => {
    // A fresh module, so the chunk hasn't loaded in an earlier test.
    vi.resetModules()
    const { LazyConnected } = await import("./LazyConnected")
    const { container } = render(<LazyConnected kind="task" id="t1" className="h-11 w-11 rounded-md" />)
    // The slot is the button's size, so the bar doesn't move when it arrives.
    const slot = container.querySelector("span[aria-hidden='true']")
    expect(slot?.className).toContain("h-11")
    expect(slot?.className).toContain("w-11")
    expect(slot?.className).not.toContain("size-8")
    const button = await screen.findByRole("button", { name: "Connected: what this connects to" })
    expect(button.getAttribute("data-connected-trigger")).toBe("task")
    expect(container.querySelector("span[aria-hidden='true']")).toBeNull()
  })

  it("holds a default slot where the screen gives no size", async () => {
    // A fresh module, so the chunk hasn't loaded in an earlier test.
    vi.resetModules()
    const { LazyConnected } = await import("./LazyConnected")
    const { container } = render(<LazyConnected kind="project" id="p1" />)
    expect(container.querySelector("span[aria-hidden='true']")?.className).toContain("size-8")
    await screen.findByRole("button", { name: "Connected: what this connects to" })
  })
})
