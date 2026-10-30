import { afterEach, describe, expect, it } from "vitest"
import { cardOf, measuredCard } from "@/lib/board/cardOf"

// The board's drop measure (TaskBoard's measuring): a card dropped into another
// column was measured as the detached element it left behind, and flew to the
// screen's corner (owner, 26 Oct).

afterEach(() => {
  document.body.innerHTML = ""
})

/** A card as the board draws it: Item's wrapper (the bound node), the card with its task id inside. */
function card(id: string) {
  const wrapper = document.createElement("li")
  const inner = document.createElement("div")
  inner.dataset.taskId = id
  wrapper.append(inner)
  return { wrapper, inner }
}

describe("the drop's measure", () => {
  it("measures a detached card as that task's card where it is now", () => {
    const board = document.createElement("div")
    document.body.append(board)
    const pressed = card("t1")
    const landed = card("t1")
    board.append(card("t0").wrapper, landed.wrapper)
    // The pressed wrapper was never in the page, or has left it: detached.
    expect(pressed.wrapper.isConnected).toBe(false)
    expect(measuredCard(board, pressed.wrapper)).toBe(landed.inner)
  })

  it("measures a card still on the board as itself (a drop in its own column)", () => {
    const board = document.createElement("div")
    document.body.append(board)
    const here = card("t1")
    board.append(here.wrapper)
    expect(measuredCard(board, here.wrapper)).toBe(here.wrapper)
  })

  it("falls back to the element when the card is gone from the board", () => {
    const board = document.createElement("div")
    document.body.append(board)
    const pressed = card("t9")
    expect(measuredCard(board, pressed.wrapper)).toBe(pressed.wrapper)
  })

  it("finds a card by id", () => {
    const board = document.createElement("div")
    const a = card("a")
    board.append(a.wrapper, card("b").wrapper)
    expect(cardOf(board, "a")).toBe(a.inner)
    expect(cardOf(null, "a")).toBeUndefined()
  })
})
