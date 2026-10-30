import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import type { Editor } from "@tiptap/core"

// Pages inside (docs C7a part 4): at a doc's foot, the pages inside it that
// its body holds no block of (made before blocks followed pages, kept by B1's
// move or an agent's rewrite, moved up by a delete), each with Add to page.

type Answer = { data?: unknown; isLoading?: boolean; isError?: boolean }
const hoisted = vi.hoisted(() => ({
  answers: new Map<string, Answer>(),
  mutate: vi.fn(),
  live: new Map<string, unknown>(),
  trash: vi.fn(),
  readNow: vi.fn(),
}))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => ({ ...(hoisted.answers.get(key) ?? { isLoading: true }), mutate: hoisted.mutate }),
}))
vi.mock("@/lib/liveEntity", async (real) => ({
  ...(await real<typeof import("@/lib/liveEntity")>()),
  useLiveEntity: (_kind: string, id: string) => hoisted.live.get(id) ?? { state: "loading" },
  readNow: hoisted.readNow,
}))
vi.mock("@/components/docTree/docActions", () => ({ trash: hoisted.trash }))
vi.mock("@/store/store", () => ({ default: { dispatch: vi.fn() } }))

import { attachBus, createDocCommandBus } from "@/components/docEditor/registry/commandBus"
import { slotFor } from "@/components/docEditor/registry/registry"
import { childrenKey } from "@/services/docGraphService"
import { docEditor, loadDocBlocks } from "../block-commands/blockTestKit"
import PagesInside from "./PagesInside"

const DOC = "d0c00000-0000-4000-8000-0000000000d1"
const HELD = "4e1d0000-0000-4000-8000-0000000000a1"
const NOTES = "40e50000-0000-4000-8000-0000000000a2"
const BUDGET = "b0d90000-0000-4000-8000-0000000000a3"
const FOLDER = "f01d0000-0000-4000-8000-0000000000a4"
const block = (id: string) => `<div data-type="subpage" data-doc-id="${id}"></div>`
const node = (uuid: string, title: string, more: Record<string, unknown> = {}) => ({ kind: "doc", uuid, title, has_children: false, ...more })
const level = (nodes: unknown[], next = "") => ({ data: { data: { parent: DOC, nodes, hidden: 1, count: nodes.length, next_cursor: next } } })
const firstPage = childrenKey(DOC, { limit: 100 })

beforeAll(loadDocBlocks, 60_000)

const detach: Array<() => void> = []
beforeEach(() => {
  hoisted.answers.clear()
  hoisted.live.clear()
  hoisted.mutate.mockReset()
  hoisted.trash.mockReset()
  hoisted.readNow.mockReset()
  hoisted.readNow.mockImplementation(async () => ({ state: "ok", data: { title: "Held", parent_id: DOC } }))
  for (const [id, title] of [[HELD, "Held"], [NOTES, "Notes"], [BUDGET, "Budget"]]) hoisted.live.set(id, { state: "ok", data: { title, parent_id: DOC } })
  hoisted.answers.set(firstPage, level([node(HELD, "Held"), node(NOTES, "Notes"), node(BUDGET, "Budget"), node(FOLDER, "Receipts", { node_kind: "folder" }), { kind: "doc", redacted: true, has_children: false }]))
})
afterEach(() => {
  cleanup()
  detach.splice(0).forEach((f) => f())
})

function mount(html: string, editable = true): Editor {
  const editor = docEditor(html)
  editor.setEditable(editable)
  detach.push(attachBus(editor, createDocCommandBus(DOC)))
  render(<PagesInside docId={DOC} editor={editor} />)
  return editor
}
const section = () => screen.queryByRole("region", { name: "Pages inside" })
const rows = () => within(section()!).getAllByRole("link").map((a) => a.textContent)
const pagesIn = (e: Editor) => {
  const out: string[] = []
  e.state.doc.forEach((n) => void (n.type.name === "subpage" && out.push(n.attrs.docId)))
  return out
}

describe("Pages inside, at a doc's foot", () => {
  it("is drawn in the doc's foot by the connected chunk", () => {
    expect(slotFor("foot", { ai: false }).map((c) => c.id)).toContain("subpage.inside")
  })

  it("lists the pages inside that the body holds no block of, in the tree's order, and no folder or page the reader can't open", () => {
    mount(`<p>One</p>${block(HELD)}`)
    expect(rows()).toEqual(["Notes", "Budget"])
    expect(within(section()!).getByRole("link", { name: "Notes" }).getAttribute("href")).toBe(`/app/doc/${NOTES}`)
  })

  it("shows nothing while the tree is read, or when every page inside has its block", () => {
    hoisted.answers.clear()
    mount(`<p>One</p>`)
    expect(section()).toBeNull()
    cleanup()
    hoisted.answers.set(firstPage, level([node(HELD, "Held")]))
    mount(`<p>One</p>${block(HELD)}`)
    expect(section()).toBeNull()
  })

  it("says when the pages inside couldn't be read, and reads them again on Try again", () => {
    hoisted.answers.set(firstPage, { isError: true })
    mount(`<p>One</p>`)
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load the pages inside")
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(hoisted.mutate).toHaveBeenCalledTimes(1)
  })

  it("adds a page at the end of the body, which takes it off the list", () => {
    const e = mount(`<p>One</p>${block(HELD)}<p>Two</p>`)
    act(() => fireEvent.click(screen.getByRole("button", { name: "Add to page, “Notes”" })))
    expect(pagesIn(e)).toEqual([HELD, NOTES])
    expect(e.state.doc.lastChild?.attrs.docId).toBe(NOTES)
    expect(rows()).toEqual(["Budget"])
    // Add all shows only for two or more.
    expect(screen.queryByRole("button", { name: "Add all to page" })).toBeNull()
  })

  it("adds every page listed at once, in the tree's order", () => {
    const e = mount(`<p>One</p>${block(HELD)}`)
    act(() => fireEvent.click(screen.getByRole("button", { name: "Add all to page" })))
    expect(pagesIn(e)).toEqual([HELD, NOTES, BUDGET])
    expect(section()).toBeNull()
  })

  it("lets a reader open the pages, and add none", () => {
    mount(`<p>One</p>${block(HELD)}`, false)
    expect(rows()).toEqual(["Notes", "Budget"])
    expect(within(section()!).queryAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual([])
  })

  it("leaves out a page trashed or moved away meanwhile, as its live read says", () => {
    hoisted.live.set(NOTES, { state: "gone" })
    hoisted.live.set(BUDGET, { state: "ok", data: { title: "Budget", parent_id: "0f0f0f0f-0000-4000-8000-000000000000" } })
    mount(`<p>One</p>${block(HELD)}`)
    expect(section()).toBeNull()
  })

  it("leaves out a page whose block is on its way to the trash, and lists it again when the trash is refused", async () => {
    let answer: (gone: null) => void = () => undefined
    hoisted.trash.mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    hoisted.answers.set(firstPage, level([node(HELD, "Held")]))
    const e = mount(`<p>One</p>${block(HELD)}<p>Two</p>`)
    act(() => e.commands.deleteRange({ from: 5, to: 6 }))
    expect(pagesIn(e)).toEqual([])
    expect(section()).toBeNull()
    await vi.waitFor(() => expect(hoisted.trash).toHaveBeenCalledTimes(1))
    await act(async () => answer(null))
    await vi.waitFor(() => expect(rows()).toEqual(["Held"]))
  })

  it("reads on while a page of the tree holds nothing missing, and finds a page further down", async () => {
    hoisted.answers.set(firstPage, level([node(HELD, "Held")], "c2"))
    hoisted.answers.set(childrenKey(DOC, { limit: 100, cursor: "c2" }), level([node(NOTES, "Notes")]))
    mount(`<p>One</p>${block(HELD)}`)
    await vi.waitFor(() => expect(rows()).toEqual(["Notes"]))
  })
})
