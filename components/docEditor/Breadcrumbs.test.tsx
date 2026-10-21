import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { TreeNodeJSON } from "@/types/docGraph"

const hoisted = vi.hoisted(() => ({ ancestors: [] as unknown[], doc: {} as Record<string, unknown>, moveDoc: vi.fn(), preview: vi.fn(), ancestorsOf: vi.fn(), post: vi.fn(), renamed: vi.fn(), toasts: [] as { title?: string; action?: unknown }[] }))

vi.mock("./chrome/useDoc", () => ({ useDoc: () => hoisted.doc }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: (key: string) => ({ data: key ? { data: { ancestors: hoisted.ancestors, truncated: false } } : undefined }) }))
vi.mock("@/services/docGraphService", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/services/docGraphService")>()), moveDoc: hoisted.moveDoc, previewDocMove: hoisted.preview, getAncestors: hoisted.ancestorsOf }))
vi.mock("@/lib/axiosInstance", () => ({ default: { post: hoisted.post }, OWN_ERRORS: { suppressErrorToast: true } }))
vi.mock("@/lib/docCache", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/docCache")>()), docRenamed: hoisted.renamed }))
vi.mock("@/store/store", () => ({ default: { dispatch: vi.fn() } }))
vi.mock("@/hooks/use-toast", () => ({ toast: (t: { title?: string; action?: React.ReactElement }) => hoisted.toasts.push(t) }))
vi.mock("@/components/navigationBar/desktop/IntentLink", () => ({
  IntentLink: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import type * as React from "react"
import Breadcrumbs, { PathLine, crumbsOf } from "./Breadcrumbs"
import { TooltipProvider } from "@/components/ui/tooltip"
import { InSplitPaneContext } from "@/hooks/useLinkTarget"

const page = (uuid: string, title: string, icon?: string): TreeNodeJSON => ({ kind: "doc", uuid, title, icon, has_children: true })
const hidden: TreeNodeJSON = { kind: "doc", has_children: true, redacted: true }

beforeEach(() => {
  hoisted.ancestors = []
  hoisted.doc = { doc_title: "RFC: Offline docs", doc_icon: "📐", doc_edit_access: 1 }
  hoisted.moveDoc.mockReset().mockResolvedValue({ access: "keep" })
  hoisted.preview.mockReset().mockResolvedValue({ available: true, can_adopt: true, lose: 0, gain: 0 })
  hoisted.ancestorsOf.mockReset().mockResolvedValue({ ancestors: [page("old", "Drafts")] })
  hoisted.post.mockReset().mockResolvedValue({})
  hoisted.toasts.length = 0
})
afterEach(cleanup)

const crumbs = () => render(<TooltipProvider><Breadcrumbs docId="me" /></TooltipProvider>)

describe("the path to a doc (P1, structure.md P0.5)", () => {
  it("shows every level up to 3, then collapses the middle into a menu of what it holds", () => {
    expect(crumbsOf([page("a", "Engineering"), page("b", "RFCs")]).map((c) => c.kind)).toEqual(["page", "page"])
    const deep = crumbsOf([page("a", "Engineering"), page("b", "Platform"), page("c", "Storage"), page("d", "RFCs")])
    expect(deep.map((c) => c.kind)).toEqual(["page", "more", "page"])
    expect(deep[1]).toEqual({ kind: "more", nodes: [page("b", "Platform"), page("c", "Storage")], hidden: 0 })
  })

  it("never names a page the viewer can't open: a run of them is one …", () => {
    expect(crumbsOf([hidden, hidden, page("c", "RFCs")])).toEqual([{ kind: "hidden", count: 2 }, { kind: "page", node: page("c", "RFCs") }])
    const middle = crumbsOf([page("a", "Eng"), hidden, hidden, page("d", "RFCs")])
    expect(middle[1]).toEqual({ kind: "hidden", count: 2 })
    // A middle with both: the menu names the pages and counts the rest.
    expect(crumbsOf([page("a", "Eng"), page("b", "Platform"), hidden, page("d", "RFCs")])[1]).toEqual({ kind: "more", nodes: [page("b", "Platform")], hidden: 1 })
  })

  it("draws Docs, the pages above with their icons, and the doc; clicking a middle page opens it", () => {
    hoisted.ancestors = [page("a", "Engineering", "🛠️"), page("b", "RFCs")]
    crumbs()
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" })
    expect(nav.textContent).toBe("Docs🛠️EngineeringRFCs📐RFC: Offline docs")
    expect(screen.getByRole("link", { name: /RFCs/ }).getAttribute("href")).toBe("/app/doc/b")
    expect(screen.getByRole("button", { name: /RFC: Offline docs/ }).getAttribute("aria-current")).toBe("page")
  })

  // Split view's design verdict (20 Oct): three views at 1440 cut every
  // title crumb to one letter ("Docs › Q…").
  it("keeps the doc's title whole, to be cut at its end on a word, and leaves it to the view's bar beside the page", () => {
    hoisted.ancestors = [page("a", "Engineering")]
    hoisted.doc = { ...hoisted.doc, doc_title: "Q4 launch plan" }
    const { unmount } = crumbs()
    const own = screen.getByRole("button", { name: /Q4 launch plan/ })
    // One line of whole words: what doesn't fit wraps out of sight, its start stays.
    expect(own.querySelector(".line-clamp-1")?.textContent).toBe("Q4 launch plan")
    unmount()
    render(
      <TooltipProvider>
        <InSplitPaneContext.Provider value={true}>
          <Breadcrumbs docId="me" />
        </InSplitPaneContext.Provider>
      </TooltipProvider>,
    )
    expect(screen.getByRole("navigation", { name: "Breadcrumb" }).textContent).toBe("DocsEngineering")
    expect(screen.queryByRole("button", { name: /Q4 launch plan/ })).toBeNull()
  })

  it("moves a page dropped on a crumb under it when nobody's access changes, with Undo", async () => {
    hoisted.ancestors = [page("a", "Engineering")]
    crumbs()
    const target = document.querySelector('[data-doc-drop-target="a"]')!
    const dropped = "0c0e4d6a-1b2c-4d5e-8f90-a1b2c3d4e5f6"
    const dataTransfer = { types: ["text/plain"], getData: () => dropped, dropEffect: "" }
    fireEvent.dragOver(target, { dataTransfer })
    await act(async () => fireEvent.drop(target, { dataTransfer }))
    // Planned as Move to… plans it: nobody's access changes, so it takes its new parent's.
    expect(hoisted.preview).toHaveBeenLastCalledWith({ doc_uuid: dropped, parent_uuid: "a", place: "last", access: "adopt" })
    expect(hoisted.moveDoc).toHaveBeenCalledWith({ doc_uuid: dropped, parent_uuid: "a", place: "last", access: "adopt" })
    expect(hoisted.toasts[0]?.title).toBe("Moved into “Engineering”")
    expect(hoisted.toasts[0]?.action).toBeTruthy()
    // Docs takes a page to the top, previewed first too; something that isn't a page is ignored.
    await act(async () => fireEvent.drop(document.querySelector('[data-doc-drop-target="top"]')!, { dataTransfer }))
    expect(hoisted.preview).toHaveBeenLastCalledWith({ doc_uuid: dropped, space: "workspace", place: "last", access: "keep" })
    expect(hoisted.moveDoc).toHaveBeenLastCalledWith({ doc_uuid: dropped, space: "workspace", place: "last", access: "keep" })
    await act(async () => fireEvent.drop(target, { dataTransfer: { types: ["text/plain"], getData: () => "some words" } }))
    expect(hoisted.moveDoc).toHaveBeenCalledTimes(2)
  })

  it("asks first, in Move to…, when a page dropped on Docs would leave its space", async () => {
    hoisted.ancestors = [page("a", "Engineering")]
    hoisted.preview.mockResolvedValue({
      available: true, can_adopt: true, lose: 2, gain: 0, summary: "2 people lose access.",
      space: null, was: { kind: "project", uuid: "x", name: "Launch", members: 3 },
    })
    const asked: string[] = []
    const bus = { docId: "me", key: "me", emit: (_: string, p: { id: string }) => asked.push(p.id), on: () => () => {} }
    const { DocBusContext } = await import("@/components/docEditor/registry/commandBus")
    const { takeStagedDrop } = await import("./chrome/stagedDrop")
    render(
      <TooltipProvider>
        <DocBusContext.Provider value={bus as never}>
          <Breadcrumbs docId="me" />
        </DocBusContext.Provider>
      </TooltipProvider>,
    )
    const dropped = "0c0e4d6a-1b2c-4d5e-8f90-a1b2c3d4e5f6"
    await act(async () => fireEvent.drop(document.querySelector('[data-doc-drop-target="top"]')!, { dataTransfer: { types: ["text/plain"], getData: () => dropped } }))
    expect(hoisted.preview).toHaveBeenCalledWith({ doc_uuid: dropped, space: "workspace", place: "last", access: "keep" })
    expect(hoisted.moveDoc).not.toHaveBeenCalled()
    expect(asked).toEqual(["doc.moveTo"])
    expect(takeStagedDrop("me")).toEqual({ page: { uuid: dropped }, target: { uuid: null, title: "Docs" } })
  })

  it("never moves a page unasked: with no Move to… to ask in, it says how to choose", async () => {
    hoisted.ancestors = [page("a", "Engineering")]
    hoisted.preview.mockResolvedValue({ available: true, can_adopt: true, lose: 3, gain: 0, summary: "3 people lose access." })
    crumbs()
    const dropped = "0c0e4d6a-1b2c-4d5e-8f90-a1b2c3d4e5f6"
    await act(async () => fireEvent.drop(document.querySelector('[data-doc-drop-target="a"]')!, { dataTransfer: { types: ["text/plain"], getData: () => dropped } }))
    expect(hoisted.moveDoc).not.toHaveBeenCalled()
    expect(hoisted.toasts[0]?.title).toBe("The page didn't move")
  })

  it("says why a drop was refused, and moves nothing", async () => {
    hoisted.ancestors = [page("a", "Engineering")]
    hoisted.preview.mockRejectedValue({ response: { status: 403, data: { code: "not_in_space", msg: "Pages can only go into a project or team you're in." } } })
    crumbs()
    const dropped = "0c0e4d6a-1b2c-4d5e-8f90-a1b2c3d4e5f6"
    await act(async () => fireEvent.drop(document.querySelector('[data-doc-drop-target="a"]')!, { dataTransfer: { types: ["text/plain"], getData: () => dropped } }))
    expect(hoisted.moveDoc).not.toHaveBeenCalled()
    expect(hoisted.toasts[0]).toMatchObject({ title: "The page didn't move", description: "Pages can only go into a project or team you're in." })
  })

  it("asks first, in Move to…, when the move would change who can open the page (PROGRAM §3.2)", async () => {
    hoisted.ancestors = [page("a", "Engineering")]
    hoisted.preview.mockResolvedValue({ available: true, can_adopt: true, lose: 3, gain: 0, summary: "3 people lose access." })
    const asked: string[] = []
    const bus = { docId: "me", key: "me", emit: (_: string, p: { id: string }) => asked.push(p.id), on: () => () => {} }
    const { DocBusContext } = await import("@/components/docEditor/registry/commandBus")
    const { takeStagedDrop } = await import("./chrome/stagedDrop")
    render(
      <TooltipProvider>
        <DocBusContext.Provider value={bus as never}>
          <Breadcrumbs docId="me" />
        </DocBusContext.Provider>
      </TooltipProvider>,
    )
    const dropped = "0c0e4d6a-1b2c-4d5e-8f90-a1b2c3d4e5f6"
    await act(async () => fireEvent.drop(document.querySelector('[data-doc-drop-target="a"]')!, { dataTransfer: { types: ["text/plain"], getData: () => dropped } }))
    expect(hoisted.moveDoc).not.toHaveBeenCalled()
    expect(asked).toEqual(["doc.moveTo"])
    expect(takeStagedDrop("me")).toEqual({ page: { uuid: dropped }, target: { uuid: "a", title: "Engineering" } })
  })

  it("renames the doc in place for whoever may edit it", async () => {
    crumbs()
    fireEvent.click(screen.getByRole("button", { name: /RFC: Offline docs/ }))
    const field = screen.getByRole("textbox", { name: "Doc title" })
    fireEvent.change(field, { target: { value: "RFC: Offline first" } })
    await act(async () => fireEvent.keyDown(field, { key: "Enter" }))
    expect(hoisted.post).toHaveBeenCalledWith("/doc/updateDoc", { doc_uuid: "me", doc_title: "RFC: Offline first" })
    expect(hoisted.renamed).toHaveBeenCalled()
  })

  // D-6: "Untitled" is only the placeholder. A rename left blank, of a doc
  // with no title or one with a title, saves nothing.
  it("never renames a doc to the word Untitled", async () => {
    for (const title of ["", "RFC: Offline docs"]) {
      cleanup()
      hoisted.post.mockClear()
      hoisted.doc = { doc_title: title, doc_icon: "📐", doc_edit_access: 1 }
      crumbs()
      fireEvent.click(screen.getByRole("button", { name: title ? /RFC: Offline docs/ : /Untitled/ }))
      const field = screen.getByRole("textbox", { name: "Doc title" })
      fireEvent.change(field, { target: { value: "  " } })
      await act(async () => fireEvent.keyDown(field, { key: "Enter" }))
      expect(hoisted.post).not.toHaveBeenCalled()
    }
  })

  it("holds the rename while a soft lock holds the page", () => {
    hoisted.doc = { doc_title: "Plan", doc_edit_access: 1, doc_lock_level: "soft" }
    crumbs()
    expect((screen.getByRole("button", { name: /Plan/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("gives a reader the title, not a rename", () => {
    hoisted.doc = { doc_title: "Plan", doc_edit_access: 0 }
    crumbs()
    expect((screen.getByRole("button", { name: /Plan/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("shows a phone the pages above the doc, as links", () => {
    hoisted.ancestors = [page("a", "Engineering"), hidden]
    render(<PathLine docId="me" />)
    const nav = screen.getByRole("navigation", { name: "Pages above this doc" })
    expect(nav.textContent).toBe("Engineering…")
    expect(screen.getByRole("link", { name: "Engineering" }).getAttribute("href")).toBe("/app/doc/a")
  })
})
