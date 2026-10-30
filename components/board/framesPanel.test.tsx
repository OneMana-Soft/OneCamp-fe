import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import * as Y from "yjs"
import { boardScene, convertForTest, type TestElement } from "@/lib/testing/boardScene"
import { putOnScreen, SCREENS } from "@/lib/testing/screens"

const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))

import FramesPanel from "./framesPanel"
import { frameElement } from "./boardOps"
import { noteSkeleton } from "@/lib/board/notes"

// The Frames panel (miro-04, miro-11): the board's frames in an order the
// board keeps for everyone; jump, rename, reorder, link.

function board() {
  const f = (id: string, x: number, y: number, name: string) => frameElement({ id, x, y, width: 800, height: 450, name }) as TestElement
  const inside = convertForTest([noteSkeleton({ id: "n1", x: 1040, y: 40, colour: "teal" }) as never])
  for (const e of inside) e.frameId = "f2"
  return boardScene([f("f2", 1000, 0, "Ideas"), f("f1", 0, 0, "Goals"), f("f3", 0, 600, "Plan"), ...inside])
}

function provider() {
  const document = new Y.Doc()
  return { document } as never as import("@hocuspocus/provider").HocuspocusProvider
}

let off = () => {}
afterEach(() => {
  cleanup()
  off()
  off = () => {}
  toast.mockReset()
})

describe("the Frames panel", () => {
  it("lists the frames in reading order until the board keeps one, with what's in each", () => {
    const s = board()
    const p = provider()
    render(<FramesPanel api={s.api} provider={p} boardId="b1" editable onClose={vi.fn()} />)
    const rows = within(screen.getByRole("list", { name: "Frames, in order" })).getAllByRole("listitem")
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringMatching(/^1GoalsEmpty/), expect.stringMatching(/^2Ideas1 note/), expect.stringMatching(/^3Plan/)])
  })

  it("moves a frame with Alt and the arrows, keeping the order in the board for everyone", () => {
    const s = board()
    const p = provider()
    render(<FramesPanel api={s.api} provider={p} boardId="b1" editable onClose={vi.fn()} />)
    fireEvent.keyDown(screen.getByRole("button", { name: /Move Goals/ }), { key: "ArrowDown", altKey: true })
    expect(p.document.getMap("boardMeta").get("frameOrder")).toEqual(["f2", "f1", "f3"])
    const rows = within(screen.getByRole("list", { name: "Frames, in order" })).getAllByRole("listitem")
    expect(rows[0].textContent).toMatch(/Ideas/)
  })

  it("renames a frame on a double-click, as one undo step", () => {
    const s = board()
    render(<FramesPanel api={s.api} provider={provider()} boardId="b1" editable onClose={vi.fn()} />)
    fireEvent.doubleClick(screen.getByRole("button", { name: /^Goals/ }))
    const field = screen.getByRole("textbox", { name: "Frame name" })
    fireEvent.change(field, { target: { value: "Our goals" } })
    fireEvent.keyDown(field, { key: "Enter" })
    expect(s.byId("f1")).toMatchObject({ name: "Our goals", version: 2 })
    expect(s.writes.at(-1)?.captureUpdate).toBe("IMMEDIATELY")
  })

  it("jumps to a frame and selects it", () => {
    const s = board()
    const scroll = vi.spyOn((s.api as unknown as { scrollToContent: () => void }), "scrollToContent")
    render(<FramesPanel api={s.api} provider={provider()} boardId="b1" editable onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: /^Plan/ }))
    expect(scroll).toHaveBeenCalled()
    expect(s.writes.at(-1)?.appState?.selectedElementIds).toEqual({ f3: true })
  })

  it("copies a link to a frame", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<FramesPanel api={board().api} provider={provider()} boardId="b1" editable onClose={vi.fn()} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy a link to Ideas" })))
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/app/board/b1?frame=f2`)
  })

  it("says what frames are for when there are none", () => {
    render(<FramesPanel api={boardScene().api} provider={provider()} boardId="b1" editable onClose={vi.fn()} />)
    expect(screen.getByText("No frames yet")).toBeTruthy()
  })

  it("is a sheet on a phone", () => {
    off = putOnScreen(SCREENS["a phone in portrait"])
    render(<FramesPanel api={board().api} provider={provider()} boardId="b1" editable onClose={vi.fn()} />)
    expect(document.querySelector("[data-frames-panel]")?.hasAttribute("data-v3-sheet")).toBe(true)
  })
})
