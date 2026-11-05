import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as Y from "yjs"
import { boardScene, type TestElement } from "@/lib/testing/boardScene"
import { LOCAL_ORIGIN } from "@/lib/board/binding"

type Toast = { title?: string; description?: string; variant?: string }
const { toasts, post } = vi.hoisted(() => ({ toasts: [] as Toast[], post: vi.fn() }))
vi.mock("@/hooks/use-toast", () => {
  const toast = (t: Toast) => void toasts.push(t)
  return { useToast: () => ({ toast }), toast }
})
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post } }))

import ProtectedLayer, { ProtectControl } from "./protectedLayer"
import { readProtection } from "@/lib/board/protection"

// Protected objects (miro-44): the selection's Protect and Lift, who protected it, the badges, and the toast when the
// server will put back this tab's change to a protected object.

const el = (id: string, x: number, extra: Partial<TestElement> = {}): TestElement => ({ id, type: "rectangle", x, y: 100, width: 160, height: 100, version: 1, ...extra })
const ann = { by: "u-ann", name: "Ann Lee", at: 1 }

function board(protectedIds: string[] = []) {
  const doc = new Y.Doc()
  const record = doc.getMap<unknown>("protected")
  for (const id of protectedIds) record.set(id, ann)
  return { doc, record: readProtection(record) }
}

beforeEach(() => {
  toasts.length = 0
  post.mockReset()
})
afterEach(cleanup)

describe("ProtectControl", () => {
  it("protects the selection for the board's owner, its words going with their shape", async () => {
    const s = boardScene([el("box", 100, { boundElements: [{ id: "words", type: "text" }] }), el("words", 110, { type: "text", containerId: "box" }), el("arrow", 400)])
    const { record } = board()
    post.mockResolvedValue({ data: { changed: 2 } })
    render(<ProtectControl api={s.api} boardId="b-1" ids={["box", "words", "arrow"]} record={record} canProtect />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Protect 2 objects" })))
    expect(post).toHaveBeenCalledWith("/board/protect", { board_uuid: "b-1", element_ids: ["box", "arrow"], protect: true })
    expect(toasts).toEqual([{ title: "Protected 2 objects", description: "Only the board's owner and admins can change or lift it now." }])
  })

  it("names who protected it and lifts only the protected ones", async () => {
    const s = boardScene([el("box", 100), el("arrow", 400)])
    const { record } = board(["box"])
    post.mockResolvedValue({ data: { changed: 1 } })
    const { container } = render(<ProtectControl api={s.api} boardId="b-1" ids={["box", "arrow"]} record={record} canProtect />)
    expect(container.querySelector("[data-protected-by]")?.textContent).toBe("Protected by Ann Lee")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Lift protection from 1 object" })))
    expect(post).toHaveBeenCalledWith("/board/protect", { board_uuid: "b-1", element_ids: ["box"], protect: false })
  })

  it("gives an editor who it was, and nothing to press; and nothing at all for what isn't protected", () => {
    const s = boardScene([el("box", 100), el("arrow", 400)])
    const { record } = board(["box"])
    const { container, rerender } = render(<ProtectControl api={s.api} boardId="b-1" ids={["box"]} record={record} canProtect={false} />)
    expect(container.querySelector("[data-protected-by]")?.textContent).toBe("Protected by Ann Lee")
    expect(screen.queryByRole("button")).toBeNull()
    rerender(<ProtectControl api={s.api} boardId="b-1" ids={["arrow"]} record={record} canProtect={false} />)
    expect(container.textContent).toBe("")
  })

  it("asks nothing for more than the server takes at once, and says so", async () => {
    const many = Array.from({ length: 501 }, (_, i) => el(`e${i}`, i * 10))
    const s = boardScene(many)
    render(<ProtectControl api={s.api} boardId="b-1" ids={many.map((e) => e.id)} record={board().record} canProtect />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Protect 501 objects" })))
    expect(post).not.toHaveBeenCalled()
    expect(toasts[0]).toMatchObject({ variant: "destructive", description: "Choose at most 500 objects at a time." })
  })
})

describe("ProtectedLayer", () => {
  it("badges each protected object in view once, a shape's words with it, named for who protected it", () => {
    const s = boardScene([el("box", 100), el("words", 110, { type: "text", containerId: "box" }), el("free", 400)])
    const { doc, record } = board(["box", "words"])
    const { container } = render(<ProtectedLayer api={s.api} doc={doc} record={record} canProtect={false} />)
    const badges = container.querySelectorAll("[data-protected-of]")
    expect(Array.from(badges, (b) => b.getAttribute("data-protected-of"))).toEqual(["box"])
    expect(badges[0].querySelector("[data-protected-badge]")?.getAttribute("data-tip")).toBe("Protected by Ann Lee")
  })

  it("tells this tab once when its own change to a protected object will be put back, and never for another's", () => {
    const s = boardScene([el("box", 100), el("free", 400)])
    const { doc, record } = board(["box"])
    render(<ProtectedLayer api={s.api} doc={doc} record={record} canProtect={false} />)
    const elements = doc.getMap<unknown>("elements")
    // Another tab's change (the server's put-back, or a collaborator's): nothing.
    doc.transact(() => elements.set("box", { id: "box", locked: true }), "remote")
    // This tab's change to what isn't protected: nothing.
    doc.transact(() => elements.set("free", { id: "free", x: 5 }), LOCAL_ORIGIN)
    expect(toasts).toEqual([])
    // This tab's Unlock of the protected shape, twice in a burst: one toast.
    doc.transact(() => elements.set("box", { id: "box", locked: false }), LOCAL_ORIGIN)
    doc.transact(() => elements.set("box", { id: "box", locked: false, x: 1 }), LOCAL_ORIGIN)
    expect(toasts).toEqual([{ title: "This is protected", description: "Only the board's owner and admins can change it or lift its protection. Ann Lee protected it." }])
  })
})
