import { describe, expect, it, vi } from "vitest"

import { cellKeyDown, gridKeyDown, gridKeyUp, playHeld, pressHeld, typeHeld, type GridKey, type GridKeyHost } from "@/components/table/gridMoves"

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

  it("goes on from a cell selected but shut on Tab, as a sheet's does, never into its own box; Shift+Tab goes back (CR-215 row 2513)", () => {
    const cells = [1, 2, 3].map((c) => `<td data-field="f${c}" data-kind="text"><div data-cell-box="" tabindex="-1"><input data-cell="1:${c}" value="v${c}"></div></td>`)
    document.body.innerHTML = `<table><tbody><tr data-row="r1">${cells.join("")}</tr></tbody></table>`
    const box = (c: number) => document.querySelector<HTMLInputElement>(`[data-cell="1:${c}"]`)!
    const shut = (c: number) => box(c).closest<HTMLElement>("[data-cell-box]")!
    const g = gridHost()
    for (const [mods, to] of [[{}, 3], [{ shiftKey: true }, 1]] as const) {
      shut(2).focus()
      const tab = keyOn(shut(2), "Tab", mods)
      gridKeyDown(tab, g)
      expect(document.activeElement).toBe(box(to))
      expect(tab.preventDefault).toHaveBeenCalled()
    }
    expect(g.bringToLife).not.toHaveBeenCalled()
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

// V-474: keys typed at a box at rest before the live cells landed, held with
// its cell, then typed into its live box as the keys would have been.
describe("typeHeld", () => {
  /** A cell at rest in a table: its read-only box holding "Hall B", focused. */
  function restCell() {
    const table = document.createElement("table")
    table.innerHTML = '<tbody><tr data-row="r1"><td data-field="where"><input data-cell="1:1" data-rest="" readonly value="Hall B"></td><td data-field="notes"><input data-cell="1:2" data-rest="" readonly value="Print"></td></tr></tbody>'
    document.body.replaceChildren(table)
    const box = table.querySelector<HTMLInputElement>('[data-cell="1:1"]')!
    box.focus()
    // Brought to life: the same box, editable (as React draws the live cell over it).
    const bringToLife = vi.fn((td: Element | null) => {
      const b = td?.querySelector<HTMLInputElement>("input[data-rest]")
      if (!b) return false
      b.removeAttribute("data-rest")
      b.readOnly = false
      return true
    })
    return { table, box, bringToLife }
  }

  it("brings the cell to life on the first key, which replaces its text, and types the rest after it", () => {
    const { box, bringToLife } = restCell()
    const typed: string[] = []
    box.addEventListener("input", () => typed.push(box.value))
    for (const key of ["H", "a", "l", "l", " ", "C"]) expect(typeHeld(key, bringToLife)).toBe(true)
    expect(bringToLife).toHaveBeenCalledTimes(1)
    expect(box.value).toBe("Hall C")
    expect(box.hasAttribute("data-rest")).toBe(false)
    expect(document.activeElement).toBe(box)
    // React reads each as typing: an input event per key.
    expect(typed).toEqual(["H", "Ha", "Hal", "Hall", "Hall ", "Hall C"])
  })

  it("takes the selection or the character beside the caret on Backspace and Delete", () => {
    const { box, bringToLife } = restCell()
    expect(typeHeld("Backspace", bringToLife)).toBe(true)
    expect(box.value).toBe("")
    for (const key of ["a", "b", "c"]) typeHeld(key, bringToLife)
    typeHeld("Backspace", bringToLife)
    expect(box.value).toBe("ab")
    box.setSelectionRange(0, 0)
    typeHeld("Delete", bringToLife)
    expect(box.value).toBe("b")
  })

  it("types where the focus is now, as a held Enter or Tab left it (CR-214); nothing outside a cell, nor when it can't come to life", () => {
    const { table, bringToLife } = restCell()
    const notes = table.querySelector<HTMLInputElement>('[data-cell="1:2"]')!
    notes.focus()
    for (const key of ["I", "n", "k"]) expect(typeHeld(key, bringToLife)).toBe(true)
    expect(notes.value).toBe("Ink")
    expect(table.querySelector<HTMLInputElement>('[data-cell="1:1"]')!.value).toBe("Hall B")
    notes.blur()
    expect(typeHeld("H", bringToLife)).toBe(false)
    const { box } = restCell()
    expect(typeHeld("H", () => false)).toBe(false)
    expect(box.value).toBe("Hall B")
  })

  it("presses a key held after the typed ones on what holds the focus, as the key", () => {
    const { box } = restCell()
    const seen: string[] = []
    document.body.addEventListener("keydown", (e) => seen.push(`${e.key}${e.shiftKey ? "+shift" : ""}`))
    pressHeld(box, { key: "Enter", shiftKey: true })
    pressHeld(box, { key: "Tab" })
    expect(seen).toEqual(["Enter+shift", "Tab"])
  })

  it("plays a held click where it was made, and types each word where it was typed or where a held click took the focus (CR-214 row 2510)", () => {
    const { table, box, bringToLife } = restCell()
    const next = table.querySelector<HTMLInputElement>('[data-cell="1:2"]')!
    const g = { bringToLife } as unknown as GridKeyHost
    const couldNot = vi.fn()
    const word = (w: string, cell: string) => [...w].map((key) => ({ key, cell }))
    // A mouse's: the click waited, so the focus stayed and "Lan" was held as 1:1's.
    const click = { detail: 1, target: next, preventDefault() {}, stopPropagation() {} }
    playHeld([...word("Ink", "1:1"), { click }, ...word("Lan", "1:1")], table, g, couldNot)
    expect([box.value, next.value, couldNot.mock.calls.length]).toEqual(["Ink", "Lan", 0])
    // A finger's: its tap moved the focus at once, so each word was held with its own cell.
    const tapped = restCell()
    const other = tapped.table.querySelector<HTMLInputElement>('[data-cell="1:2"]')!
    other.focus()
    playHeld([...word("Ink", "1:1"), ...word("Lan", "1:2")], tapped.table, { bringToLife: tapped.bringToLife } as unknown as GridKeyHost, couldNot)
    expect([tapped.box.value, other.value, couldNot.mock.calls.length]).toEqual(["Ink", "Lan", 0])
  })

  it("types a word held after a move or a click with no word before it where that took the focus, never in the cell it left (CR-215 row 2513)", () => {
    const couldNot = vi.fn()
    // Each held as the grid holds it: with what held the focus then (`from`).
    const word = (w: string, cell: string, from: Element) => [...w].map((key) => ({ key, cell, from }))
    const three = () => {
      const c = restCell()
      c.table.querySelector("tr")!.insertAdjacentHTML("beforeend", '<td data-field="extra"><input data-cell="1:3" data-rest="" readonly value="Lanyards"></td>')
      const at = (id: string) => c.table.querySelector<HTMLInputElement>(`[data-cell="${id}"]`)!
      return { ...c, at }
    }
    const values = (c: ReturnType<typeof three>) => ["1:1", "1:2", "1:3"].map((id) => c.at(id).value)
    // A held ArrowRight: the focus stayed on 1:1 while it waited, so "Pr" was held as 1:1's.
    const moved = three()
    playHeld([{ key: "ArrowRight", from: moved.box }, ...word("Pr", "1:1", moved.box)], moved.table, gridHost(), couldNot)
    expect(values(moved)).toEqual(["Hall B", "Pr", "Lanyards"])
    // A held Tab the grid's keys leave to the browser moves on as the browser's own would, before the word.
    const tabbed = three()
    playHeld([{ key: "Tab", from: tabbed.box }, ...word("Pr", "1:1", tabbed.box)], tabbed.table, gridHost(), couldNot)
    expect(values(tabbed)).toEqual(["Hall B", "Pr", "Lanyards"])
    // A held click on 1:3, the same.
    const clicked = three()
    const click = { detail: 1, target: clicked.at("1:3"), preventDefault() {}, stopPropagation() {} }
    playHeld([{ click, from: clicked.box }, ...word("Ox", "1:1", clicked.box)], clicked.table, gridHost(), couldNot)
    expect(values(clicked)).toEqual(["Hall B", "Print", "Ox"])
    // A finger's tap on 1:3 after the held move moved the focus itself: the word goes where it was typed.
    const tapped = three()
    tapped.at("1:3").focus()
    playHeld([{ key: "ArrowRight", from: tapped.box }, ...word("Ox", "1:3", tapped.at("1:3"))], tapped.table, gridHost(), couldNot)
    expect(values(tapped)).toEqual(["Hall B", "Print", "Ox"])
    // A tap on 1:2, which the replayed move then leaves for 1:3: the word stays in 1:2, where it was typed (CR-217).
    const left = three()
    left.at("1:2").focus()
    playHeld([{ key: "ArrowRight", from: left.box }, ...word("Ox", "1:2", left.at("1:2"))], left.table, { ...gridHost(), cols: 4 }, couldNot)
    expect(values(left)).toEqual(["Hall B", "Ox", "Lanyards"])
    expect(document.activeElement).toBe(left.at("1:2"))
    expect(couldNot).not.toHaveBeenCalled()
  })

  it("moves on a held Tab nothing took, as the browser's own: the box it leaves saves on its blur, the next box all selected; Shift+Tab goes back (CR-214 row 2508)", () => {
    const { table, box } = restCell()
    const next = table.querySelector<HTMLInputElement>('[data-cell="1:2"]')!
    const blurs = vi.fn()
    box.addEventListener("blur", blurs)
    pressHeld(box, { key: "Tab" })
    expect(document.activeElement).toBe(next)
    expect(blurs).toHaveBeenCalledTimes(1)
    expect([next.selectionStart, next.selectionEnd]).toEqual([0, "Print".length])
    pressHeld(next, { key: "Tab", shiftKey: true })
    expect(document.activeElement).toBe(box)
    // One a box took for itself stays, and so does one with Ctrl, Alt or Meta (the browser's or the system's).
    box.addEventListener("keydown", (e) => e.preventDefault(), { once: true })
    pressHeld(box, { key: "Tab" })
    for (const mod of ["ctrlKey", "altKey", "metaKey"] as const) pressHeld(box, { key: "Tab", [mod]: true })
    expect(document.activeElement).toBe(box)
  })
})
