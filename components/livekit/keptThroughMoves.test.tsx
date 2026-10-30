import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useKeptThroughMoves } from "./keptThroughMoves"

// What a move to or from a breakout room keeps (calls package C): the call's
// view mounts again with each move, and the live walk of 28 Oct found the
// clock at 0:00 again, a dismissed captions notice back, and "Stop captioning
// me" forgotten. The call keeps them, for every view it mounts.
describe("what a move keeps", () => {
  it("keeps the call's clock, the captions choices and everyone seen, from one view to the next", () => {
    const { result, rerender } = renderHook(() => useKeptThroughMoves())
    const joinedAt = result.current.joinedAt
    act(() => {
      result.current.setNoticeDismissed(1_700)
      result.current.setNotMe(true)
      result.current.setHiddenFor(1_700)
    })
    result.current.seen.set("ana", { identity: "ana", name: "Ana Diaz" })
    rerender()
    expect(result.current).toMatchObject({ joinedAt, noticeDismissed: 1_700, notMe: true, hiddenFor: 1_700 })
    expect(result.current.seen.get("ana")?.name).toBe("Ana Diaz")
  })

  it("answers the same keeping while nothing in it changes, so the views under it don't redraw for it", () => {
    const { result, rerender } = renderHook(() => useKeptThroughMoves())
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })
})
