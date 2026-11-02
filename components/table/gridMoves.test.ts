import { describe, expect, it, vi } from "vitest"

import { cellKeyDown, gridKeyDown, gridKeyUp, type GridKey, type GridKeyHost } from "@/components/table/gridMoves"

// A selected cell's Space (cellKeyDown) and its keyup (gridKeyUp). Firefox
// clicks a button on Space's keyup whatever its keydown said, so a Space the
// grid took keeps its keyup, once; a Space it left (a checkbox's, which Space
// ticks) keeps neither.

/** A selected cell at rest: its read-only box, in a cell of this kind. */
function cellBox(kind: string): HTMLElement {
  const td = document.createElement("td")
  td.dataset.kind = kind
  const box = document.createElement("input")
  box.readOnly = true
  box.setAttribute("data-rest", "")
  box.dataset.cell = "0:1"
  td.append(box)
  return box
}

const host = (): GridKeyHost => ({
  rows: 3,
  cols: 3,
  rowId: (row) => `row-${row}`,
  focusCell: () => {},
  toggleRow: () => {},
  bringToLife: () => true,
  openRecord: () => true,
  setDay: () => false,
})

const spaceDown = (target: HTMLElement): GridKey => ({ key: " ", code: "Space", target, composing: false, preventDefault: vi.fn(), stopPropagation: vi.fn() })
const spaceUp = () => ({ key: " ", preventDefault: vi.fn() })

describe("a selected cell's Space and its keyup", () => {
  it("keeps the keyup of a Space that expanded the record, once", () => {
    const down = spaceDown(cellBox("text"))
    expect(cellKeyDown(down, host())).toBe(true)
    expect(down.preventDefault).toHaveBeenCalledOnce()
    const up = spaceUp()
    gridKeyUp(up)
    expect(up.preventDefault).toHaveBeenCalledOnce()
    const next = spaceUp()
    gridKeyUp(next)
    expect(next.preventDefault).not.toHaveBeenCalled()
  })

  it("forgets a Space it took whose keyup went to the record, so a checkbox's next Space ticks it (V-267)", () => {
    // The record it opens takes the focus, so this Space's keyup lands there, never on the grid.
    expect(cellKeyDown(spaceDown(cellBox("text")), host())).toBe(true)
    // Back on the grid, a checkbox's Space is its own...
    const tick = spaceDown(cellBox("checkbox"))
    expect(cellKeyDown(tick, host())).toBe(false)
    expect(tick.preventDefault).not.toHaveBeenCalled()
    // ...and so is its keyup.
    const up = spaceUp()
    gridKeyUp(up)
    expect(up.preventDefault).not.toHaveBeenCalled()
  })
})

// V-295 (main's 21:0x 1 Nov ruling): a selected cell (shut, at rest, or its
// box's whole text selected and unchanged, as a click or a move leaves it) is
// not being typed in. Enter and F2 open it, the caret at its text's end, as a
// sheet's do, and Space expands its record; Enter in a cell being typed in
// saves it, going down a row; the arrows go across from a selected cell.

/** A text cell of a grid's body at 1:1 holding text: its box at rest (read-only), shut (the cell holds the focus itself) or live, its whole text selected. */
function textCell(how: "rest" | "shut" | "live", { text = "Banner", type = "text" } = {}) {
  document.body.innerHTML = `<table><tbody><tr data-row="r1"><td data-field="item" data-kind="text"><div data-cell-box="" tabindex="-1"><input type="${type}" data-cell="1:1" aria-label="Item"></div></td></tr></tbody></table>`
  const box = document.querySelector<HTMLInputElement>("[data-cell]")!
  box.value = text
  if (how === "rest") {
    box.readOnly = true
    box.setAttribute("data-rest", "")
  }
  const focused = how === "shut" ? box.closest<HTMLElement>("[data-cell-box]")! : box
  focused.focus()
  if (how !== "shut" && box.selectionStart !== null) box.select()
  return { box, focused }
}

/** The grid: focusCell focuses a cell's box with all of it selected, as the grid's does, and bringToLife makes a box at rest live. */
const gridHost = () => ({
  ...host(),
  openRecord: vi.fn(() => true),
  focusCell: vi.fn((row: number, col: number) => {
    const el = document.querySelector<HTMLInputElement>(`[data-cell="${row}:${col}"]`)
    el?.focus()
    if (el && el.selectionStart !== null) el.select()
  }),
  bringToLife: vi.fn((td: Element | null) => {
    const box = td?.querySelector("[data-rest]")
    if (!(box instanceof HTMLInputElement)) return false
    box.readOnly = false
    box.removeAttribute("data-rest")
    return true
  }),
})
const keyOn = (target: EventTarget, key: string, mods: Partial<GridKey> = {}): GridKey => ({ key, target, composing: false, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...mods })
const boxAt = () => document.querySelector<HTMLInputElement>('[data-cell="1:1"]')!

describe("a selected cell's Enter, F2, Space and arrows (V-295)", () => {
  it.each(["rest", "shut", "live"] as const)("opens a cell selected %s on Enter or F2, the caret at its text's end", (how) => {
    for (const key of ["Enter", "F2"]) {
      const { focused } = textCell(how)
      const g = gridHost()
      const e = keyOn(focused, key)
      gridKeyDown(e, g)
      expect(g.focusCell).toHaveBeenCalledWith(1, 1)
      expect(g.focusCell).toHaveBeenCalledTimes(1)
      expect(document.activeElement).toBe(boxAt())
      expect(boxAt().readOnly).toBe(false)
      expect([boxAt().selectionStart, boxAt().selectionEnd]).toEqual([6, 6])
      expect(e.preventDefault).toHaveBeenCalled()
    }
  })

  it("saves a cell being typed in on Enter, going down a row: a caret in its text, its text changed, or no text", () => {
    const ways: ((box: HTMLInputElement) => void)[] = [
      (box) => box.setSelectionRange(2, 2),
      (box) => box.setAttribute("data-escape-own", ""),
      (box) => (box.value = ""),
    ]
    for (const way of ways) {
      const { box } = textCell("live")
      way(box)
      const g = gridHost()
      gridKeyDown(keyOn(box, "Enter"), g)
      expect(g.focusCell).toHaveBeenCalledWith(2, 1)
    }
  })

  it("goes up from a selected cell on Shift+Enter, as a sheet does", () => {
    for (const how of ["rest", "shut", "live"] as const) {
      const { focused } = textCell(how)
      const g = gridHost()
      gridKeyDown(keyOn(focused, "Enter", { shiftKey: true }), g)
      expect(g.focusCell).toHaveBeenCalledWith(0, 1)
    }
  })

  it("goes across from a cell its click selected, and moves the caret in one being typed in", () => {
    const { box } = textCell("live")
    const g = gridHost()
    gridKeyDown(keyOn(box, "ArrowRight"), g)
    expect(g.focusCell).toHaveBeenLastCalledWith(1, 2)
    box.select()
    gridKeyDown(keyOn(box, "ArrowLeft"), g)
    expect(g.focusCell).toHaveBeenLastCalledWith(1, 0)
    box.setSelectionRange(2, 2)
    const typing = keyOn(box, "ArrowRight")
    gridKeyDown(typing, g)
    expect(g.focusCell).toHaveBeenCalledTimes(2)
    expect(typing.preventDefault).not.toHaveBeenCalled()
  })

  it("expands the record from a cell its click selected on Space, and leaves the space to a cell being typed in", () => {
    const { box } = textCell("live")
    const g = gridHost()
    expect(cellKeyDown(spaceDown(box), g)).toBe(true)
    expect(g.openRecord).toHaveBeenCalledWith(1, 1)
    gridKeyUp(spaceUp())
    box.setSelectionRange(3, 3)
    expect(cellKeyDown(spaceDown(box), g)).toBe(false)
    expect(g.openRecord).toHaveBeenCalledTimes(1)
  })

  it("opens an email cell at rest on F2 without a throw, though its box has no caret to place", () => {
    const { box } = textCell("rest", { text: "sam@example.com", type: "email" })
    const g = gridHost()
    expect(() => gridKeyDown(keyOn(box, "F2"), g)).not.toThrow()
    expect(g.focusCell).toHaveBeenCalledWith(1, 1)
    expect(document.activeElement).toBe(boxAt())
  })
})
