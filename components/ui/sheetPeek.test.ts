import { afterEach, describe, expect, it } from "vitest"
import { peekRows, peekTrim } from "./sheetPeek"

// Eight 48px rows a pixel apart from 40px down (the Frames sheet's sizes under their label, miro-11 F1).
const rows = Array.from({ length: 8 }, (_, n) => ({ top: 40 + n * 49, height: 48 }))

describe("peekTrim: how far a sheet's foot comes up so its cut falls across a row", () => {
  it("cuts a clean row edge back to that row's middle", () => {
    // Four rows whole, the cut on the fourth's foot at 235 (a phone held sideways): its middle is at 187 + 24.
    expect(peekTrim(235, rows)).toBe(235 - (187 + 24))
  })

  it("leaves a cut that already falls across a row's middle third", () => {
    expect(peekTrim(236 + 24, rows)).toBe(0)
    expect(peekTrim(236 + 17, rows)).toBe(0)
    expect(peekTrim(236 + 31, rows)).toBe(0)
  })

  it("takes a sliver back to the middle of the row above it", () => {
    // 4px of the fifth row: its fourth is the part-row.
    expect(peekTrim(240, rows)).toBe(240 - (187 + 24))
  })

  it("cuts a row that ends just short of the cut, its gap showing, to that row's middle", () => {
    expect(peekTrim(236, rows)).toBe(236 - (187 + 24))
  })

  it("leaves a list that ends above the cut, or starts below it", () => {
    expect(peekTrim(40 + 8 * 49 + 10, rows)).toBe(0)
    expect(peekTrim(30, rows)).toBe(0)
    expect(peekTrim(300, [])).toBe(0)
  })

  it("leaves a sliver of the first row alone: there is no row above it to show part of", () => {
    expect(peekTrim(44, rows)).toBe(0)
  })
})

describe("peekRows", () => {
  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("does nothing for a list in no sheet (the Frame tool's popover on a computer)", () => {
    const list = document.createElement("ul")
    document.body.append(list)
    expect(peekRows(list)).toBeUndefined()
    expect(peekRows(null)).toBeUndefined()
  })

  it("gives the body back its own height when the list goes", () => {
    document.body.innerHTML = '<div data-detent="medium"><div data-sheet-body=""><ul><li></li></ul></div></div>'
    const body = document.querySelector<HTMLElement>("[data-sheet-body]")!
    const undo = peekRows(document.querySelector("ul"))!
    body.style.maxHeight = "100px"
    undo()
    expect(body.style.maxHeight).toBe("")
  })
})
