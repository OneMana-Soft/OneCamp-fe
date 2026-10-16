import { describe, expect, it } from "vitest"
import type { Active, Over } from "@dnd-kit/core"
import { BOARD_AUTO_SCROLL, boardAnnouncements } from "@/lib/board/drag"

describe("a board's scrolling while a card is held", () => {
  it("scrolls the board's own scrollers alone, at the very edge", () => {
    const board = document.createElement("div")
    board.dataset.boardScroll = ""
    expect(BOARD_AUTO_SCROLL.canScroll?.(board)).toBe(true)
    expect(BOARD_AUTO_SCROLL.canScroll?.(document.createElement("div"))).toBe(false)
    expect(BOARD_AUTO_SCROLL.canScroll?.(document.documentElement)).toBe(false)
    expect(BOARD_AUTO_SCROLL.threshold).toEqual({ x: 0.06, y: 0.1 })
  })
})

// dnd-kit's own announcements read raw ids: "Picked up draggable item 6c0f…".
describe("what a drag says", () => {
  const say = boardAnnouncements({
    card: (id) => (id === "6c0f" ? "Launch plan" : "?"),
    lane: (id) => ({ o_todo: "To do", o_done: "Done" })[String(id)] ?? "?",
    laneOf: (id) => (id === "6c0f" ? "o_todo" : undefined),
  })
  const active = { id: "6c0f" } as Active
  const over = (id: string) => ({ id }) as Over

  it("names the card and the lanes, as the keys do", () => {
    expect(say.onDragStart({ active })).toBe("Picked up Launch plan, in To do.")
    expect(say.onDragOver({ active, over: over("o_done") })).toBe("Done")
    expect(say.onDragOver({ active, over: null })).toBe("Not over a lane.")
    expect(say.onDragEnd({ active, over: over("o_done") })).toBe("Moved to Done.")
    expect(say.onDragEnd({ active, over: over("o_todo") })).toBe("Put back in To do.")
    expect(say.onDragEnd({ active, over: null })).toBe("Put back where it was.")
    expect(say.onDragCancel({ active, over: null })).toBe("Put back where it was.")
  })
})
