import { describe, expect, it } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { boardScene, type TestElement } from "@/lib/testing/boardScene"
import { useElementsChanged } from "./useElementsChanged"

// What a part drawn on some elements hears of them (the bar beside a selection, a note's tag chips): Excalidraw
// moves, sizes and turns elements IN PLACE and keeps its array until a move ends (boardScene's move and drop).

const el = (id: string, x = 0): TestElement => ({ id, type: "rectangle", x, y: 0, width: 100, height: 100, version: 1 })
const DRAG = { selectedElementsAreBeingDragged: true }
const A = ["a"]
/** The scene's updateScene, as Excalidraw's: a write that replaces the array (an undo, a collaborator). */
const write = (s: ReturnType<typeof boardScene>, elements: TestElement[]) =>
  act(() => (s.api as { updateScene: (scene: { elements: TestElement[] }) => void }).updateScene({ elements }))
const NONE: string[] = []

describe("useElementsChanged", () => {
  it("holds while its elements move by hand, and rises once as the move ends", () => {
    const s = boardScene([el("a"), el("b", 200)])
    const { result } = renderHook(() => useElementsChanged(s.api, A))
    expect(result.current).toBe(0)
    s.move(["a"], 10, 0, DRAG)
    s.move(["a"], 10, 0, DRAG)
    expect(result.current).toBe(0)
    s.drop()
    expect(result.current).toBe(1)
  })

  it("rises with every frame of a move, a resize or a turn, for a part that rides on its elements", () => {
    const s = boardScene([el("a"), el("b", 200)])
    const { result } = renderHook(() => useElementsChanged(s.api, A, { duringMoves: true }))
    s.move(["a"], 10, 0, DRAG)
    s.move(["a"], 10, 0, DRAG)
    expect(result.current).toBe(2)
    s.move(["a"], 0, 0, { selectedElementsAreBeingDragged: false, isResizing: true })
    s.move(["a"], 0, 0, { isResizing: false, isRotating: true })
    expect(result.current).toBe(4)
    // The drop's new array holds the same elements, unchanged since the last frame: nothing more.
    s.drop()
    expect(result.current).toBe(4)
  })

  it("rises at once for a nudge, an undo's new copy or a collaborator's write, and never for another element", () => {
    const s = boardScene([el("a"), el("b", 200)])
    const { result } = renderHook(() => useElementsChanged(s.api, A))
    s.move(["a"], 0, 5)
    expect(result.current).toBe(1)
    s.move(["b"], 0, 5)
    act(() => {
      s.select(["b"])
      s.pan()
    })
    expect(result.current).toBe(1)
    write(s, [{ ...s.byId("a")!, x: 40, version: 9 }, s.byId("b")!])
    expect(result.current).toBe(2)
    // Deleted: it rises, and then hears nothing of it.
    write(s, [{ ...s.byId("a")!, isDeleted: true, version: 10 }, s.byId("b")!])
    expect(result.current).toBe(3)
  })

  it("does nothing with nothing to watch", () => {
    const s = boardScene([el("a")])
    const none = renderHook(() => useElementsChanged(s.api, NONE))
    s.move(["a"], 0, 5)
    s.drop()
    expect(none.result.current).toBe(0)
  })
})
