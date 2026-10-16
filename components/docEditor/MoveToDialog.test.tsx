import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const hoisted = vi.hoisted(() => ({
  moveDoc: vi.fn(),
  previewDocMove: vi.fn(),
  staged: null as null | { count: number; moveTo: (t: string) => Promise<void> },
  toasts: [] as { title?: string; description?: string }[],
}))

vi.mock("./chrome/useDoc", () => ({ useDoc: () => ({ doc_title: "Launch notes" }) }))
vi.mock("./chrome/stagedMove", () => ({ takeStagedMove: () => hoisted.staged }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isTablet: false, isDesktop: true }) }))
vi.mock("@/hooks/use-toast", () => ({ toast: (t: { title?: string }) => hoisted.toasts.push(t) }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => ({
    data: key.startsWith("/doc/ancestors")
      ? { data: { ancestors: [{ kind: "doc", uuid: "p-old", title: "Old parent", has_children: true }], truncated: false } }
      : key.startsWith("/doc/list")
        ? { data: { scope: "recent", count: 2, docs: [
            { doc_uuid: "p-eng", doc_title: "Engineering", path: [], doc_icon: "📐" },
            { doc_uuid: "m1", doc_title: "Launch notes", path: [] },
          ] } }
        : undefined,
  }),
}))
vi.mock("@/services/docGraphService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/docGraphService")>()),
  moveDoc: hoisted.moveDoc,
  previewDocMove: hoisted.previewDocMove,
}))

import MoveToDialog, { adoptWording, keepWording } from "./MoveToDialog"

beforeEach(() => {
  hoisted.moveDoc.mockReset().mockImplementation((m: { access?: string }) => Promise.resolve({ access: m.access ?? "keep" }))
  hoisted.previewDocMove.mockReset()
  hoisted.staged = null
  hoisted.toasts.length = 0
})
afterEach(cleanup)

const choose = async (name: RegExp) => {
  await act(async () => fireEvent.click(screen.getByRole("option", { name })))
}

describe("Move to… (structure.md P0.5)", () => {
  it("asks about a page dropped on a breadcrumb at once, and moves that page", async () => {
    const { stageDrop } = await import("./chrome/stagedDrop")
    hoisted.previewDocMove.mockResolvedValue({ available: true, can_adopt: true, lose: 2, gain: 0, pages: 0, summary: "2 people lose access." })
    stageDrop("m1", { page: { uuid: "d-other" }, target: { uuid: "p-eng", title: "Engineering" } })
    await act(async () => void render(<MoveToDialog docId="m1" onClose={() => {}} />))
    expect(hoisted.previewDocMove).toHaveBeenCalledWith({ doc_uuid: "d-other", parent_uuid: "p-eng", place: "last", access: "adopt" })
    expect(document.querySelector('[data-doc-move-dialog="access"]')).not.toBeNull()
  })

  it("offers recent pages and the top of Docs, never the page itself or where it already is", () => {
    render(<MoveToDialog docId="m1" onClose={() => {}} />)
    expect(screen.getByText("Move “Launch notes” to…")).toBeTruthy()
    const options = screen.getAllByRole("option").map((o) => o.getAttribute("data-doc-move-target"))
    expect(options).toEqual(["top", "p-eng"])
  })

  it("asks what to do when people would lose access, and keeps it when told (A5's preview)", async () => {
    hoisted.previewDocMove.mockResolvedValue({ available: true, can_adopt: true, lose: 3, gain: 1, pages: 2, summary: "3 people lose access, and 1 person gains it." })
    const close = vi.fn()
    render(<MoveToDialog docId="m1" onClose={close} />)
    await choose(/Engineering/)
    expect(hoisted.previewDocMove).toHaveBeenCalledWith({ doc_uuid: "m1", parent_uuid: "p-eng", place: "last", access: "adopt" })
    expect(screen.getByText("3 people lose access, and 1 person gains it.")).toBeTruthy()
    expect(screen.getByText(/So does the page under it that you have full access to/)).toBeTruthy()
    // Losing access, keeping is chosen first.
    expect((document.querySelector('[data-choice="keep"]') as HTMLElement).getAttribute("data-state")).toBe("checked")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Move" })))
    expect(hoisted.moveDoc).toHaveBeenCalledWith({ doc_uuid: "m1", parent_uuid: "p-eng", place: "last", access: "keep" })
    expect(hoisted.toasts[0]?.title).toBe("Moved to “Engineering”")
    expect(close).toHaveBeenCalled()
  })

  it("uses the new parent's access when asked", async () => {
    hoisted.previewDocMove.mockResolvedValue({ available: true, can_adopt: true, lose: 1, gain: 0, pages: 1, summary: "1 person loses access." })
    render(<MoveToDialog docId="m1" onClose={() => {}} />)
    await choose(/Engineering/)
    fireEvent.click(document.querySelector('[data-choice="adopt"]')!)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Move" })))
    expect(hoisted.moveDoc).toHaveBeenCalledWith({ doc_uuid: "m1", parent_uuid: "p-eng", place: "last", access: "adopt" })
  })

  it("asks nothing when nobody's access moves, or when the mover can't adopt", async () => {
    hoisted.previewDocMove.mockResolvedValueOnce({ available: true, can_adopt: true, lose: 0, gain: 0, summary: "No one's access changes." })
    render(<MoveToDialog docId="m1" onClose={() => {}} />)
    await choose(/Engineering/)
    expect(hoisted.moveDoc).toHaveBeenLastCalledWith({ doc_uuid: "m1", parent_uuid: "p-eng", place: "last", access: "adopt" })
    cleanup()
    hoisted.previewDocMove.mockResolvedValueOnce({ available: true, can_adopt: false, lose: 2, gain: 0, summary: "2 people lose access." })
    render(<MoveToDialog docId="m1" onClose={() => {}} />)
    await choose(/Engineering/)
    expect(hoisted.moveDoc).toHaveBeenLastCalledWith({ doc_uuid: "m1", parent_uuid: "p-eng", place: "last", access: "keep" })
  })

  it("previews the top of Docs too, moves there at once when nobody's access changes, and Undo puts it back", async () => {
    hoisted.previewDocMove.mockResolvedValue({ available: true, can_adopt: true, lose: 0, gain: 0, summary: "No one's access changes." })
    render(<MoveToDialog docId="m1" onClose={() => {}} />)
    await choose(/Docs/)
    expect(hoisted.previewDocMove).toHaveBeenCalledWith({ doc_uuid: "m1", space: "workspace", place: "last", access: "keep" })
    expect(hoisted.moveDoc).toHaveBeenCalledWith({ doc_uuid: "m1", space: "workspace", place: "last", access: "keep" })
    const undo = (hoisted.toasts[0] as { action?: { props: { onClick: () => void } } }).action
    await act(async () => undo?.props.onClick())
    expect(hoisted.moveDoc).toHaveBeenLastCalledWith({ doc_uuid: "m1", parent_uuid: "p-old", place: "last", access: "keep" })
  })

  it("asks before taking a page out of its space to the top of Docs, with only the move to say yes to", async () => {
    hoisted.previewDocMove.mockResolvedValue({
      available: true, can_adopt: true, lose: 2, gain: 0, summary: "2 people lose access.",
      space: null, was: { kind: "project", uuid: "x", name: "Launch", members: 3 },
    })
    render(<MoveToDialog docId="m1" onClose={() => {}} />)
    await choose(/Docs/)
    expect(hoisted.moveDoc).not.toHaveBeenCalled()
    expect(screen.getByText("2 people lose access.")).toBeTruthy()
    expect(screen.getByText("Moving “Launch notes” to the top of Docs. “Launch notes” leaves “Launch”, and being in it no longer lets people open it.")).toBeTruthy()
    expect(document.querySelector("[data-choice]")).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Move" })))
    expect(hoisted.moveDoc).toHaveBeenCalledWith({ doc_uuid: "m1", space: "workspace", place: "last", access: "keep" })
  })

  it("asks about a page dropped on Docs at once, as about one dropped on a page", async () => {
    const { stageDrop } = await import("./chrome/stagedDrop")
    hoisted.previewDocMove.mockResolvedValue({ available: true, can_adopt: true, lose: 2, gain: 0, summary: "2 people lose access.", space: null, was: { kind: "team", uuid: "t", name: "Design", members: 4 } })
    stageDrop("m1", { page: { uuid: "d-other" }, target: { uuid: null, title: "Docs" } })
    await act(async () => void render(<MoveToDialog docId="m1" onClose={() => {}} />))
    expect(hoisted.previewDocMove).toHaveBeenCalledWith({ doc_uuid: "d-other", space: "workspace", place: "last", access: "keep" })
    expect(document.querySelector('[data-doc-move-dialog="access"]')).not.toBeNull()
  })

  it("says a page moved into another space opens to everyone in it, whichever access it keeps", async () => {
    hoisted.previewDocMove.mockResolvedValue({
      available: true, can_adopt: true, lose: 0, gain: 3, pages: 1, summary: "3 people gain access.",
      space: { kind: "project", uuid: "x", name: "Launch", members: 3 }, was: null,
    })
    render(<MoveToDialog docId="m1" onClose={() => {}} />)
    await choose(/Engineering/)
    expect(screen.getByText("Its own people and teams keep it, and everyone in “Launch” can open it too.")).toBeTruthy()
    expect(screen.getByText(/“Launch notes” goes into “Launch”, and everyone in it can open it there\./)).toBeTruthy()
  })

  it("moves the blocks B1 staged instead, and says what happened when it can't", async () => {
    const moveTo = vi.fn().mockRejectedValueOnce(new Error("You can't edit that doc, so the blocks can't go there. Choose another doc.")).mockResolvedValueOnce(undefined)
    hoisted.staged = { count: 3, moveTo }
    const close = vi.fn()
    render(<MoveToDialog docId="m1" onClose={close} />)
    expect(screen.getByText("Move 3 blocks to…")).toBeTruthy()
    expect(document.querySelector('[data-doc-move-target="top"]')).toBeNull()
    await choose(/Engineering/)
    expect(moveTo).toHaveBeenCalledWith("p-eng")
    expect(screen.getByRole("alert").textContent).toBe("You can't edit that doc, so the blocks can't go there. Choose another doc.")
    await choose(/Engineering/)
    expect(hoisted.toasts[0]?.title).toBe("Moved 3 blocks to “Engineering”")
    expect(close).toHaveBeenCalled()
    expect(hoisted.moveDoc).not.toHaveBeenCalled()
  })

  it("words the choice from the preview", () => {
    expect(adoptWording({ pages: 1 }, "RFCs")).toEqual({ label: "Use the new parent's access", description: "The same people and teams as “RFCs” can open it." })
    expect(adoptWording({ pages: 4 }, "RFCs").description).toBe("The same people and teams as “RFCs” can open it. So do the 3 pages under it that you have full access to.")
    expect(keepWording({})).toBe("Everyone who can open it now still can, and nobody else.")
    expect(keepWording({ space: null, was: { kind: "team", uuid: "t", name: "Design", members: 4 } })).toBe("Its own people and teams keep it, and being in “Design” no longer opens it.")
  })
})
