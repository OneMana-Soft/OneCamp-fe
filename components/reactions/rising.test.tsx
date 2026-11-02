import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, renderHook, screen } from "@testing-library/react"
import { REACTION_FLOAT_MS, Rising, useReactionQueue } from "./rising"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("useReactionQueue", () => {
  it("keeps where a reaction rises from, takes one from a person at a time, keeps a burst's newest eight, and lets each go", () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useReactionQueue())
    act(() => {
      expect(result.current.add("🎉", "ann", "Ann", false, { x: 120, y: 40 })).toBe(true)
      expect(result.current.add("👍", "ann", "Ann", false), "the same person again at once counts once").toBe(false)
    })
    expect(result.current.shown).toEqual([{ id: 1, emoji: "🎉", name: "Ann", mine: false, from: { x: 120, y: 40 } }])
    act(() => {
      for (let i = 0; i < 9; i++) result.current.add("👏", `p${i}`, `P${i}`, false)
    })
    expect(result.current.shown.map((r) => r.name)).toEqual(["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"])
    act(() => vi.advanceTimersByTime(REACTION_FLOAT_MS - 1))
    expect(result.current.shown).toHaveLength(8)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.shown).toEqual([])
  })
})

describe("Rising", () => {
  it("rises from its point, centred on it, when it has one, and in its list's flow when it hasn't; a screen reader hears who reacted", () => {
    render(
      <ul>
        <Rising r={{ id: 1, emoji: "🎉", name: "Ann", mine: false, from: { x: 120, y: 40 } }} />
        <Rising r={{ id: 2, emoji: "👍", name: "You", mine: true }} />
      </ul>,
    )
    const [ann, mine] = screen.getAllByRole("listitem")
    expect(ann.className.split(" ")).toEqual(expect.arrayContaining(["absolute", "-translate-x-1/2"]))
    expect([ann.style.left, ann.style.top]).toEqual(["120px", "40px"])
    expect(ann.dataset.reaction).toBe("")
    expect(mine.className.split(" ")).not.toContain("absolute")
    expect([mine.style.left, mine.style.top]).toEqual(["", ""])
    expect(mine.dataset.reaction).toBe("mine")
    expect(screen.getByText("Ann reacted: Celebrate")).toBeTruthy()
  })
})
