import { describe, expect, it } from "vitest"
import { BRING_FIELD, bringsIn, centreOn, pointerOf } from "./hereNow"

// "Here now" on a board (miro-04 4): where to look to see someone. Who is here is the doc's grouping (presence/people.test).

const tab = (id: string | null, name: string, pointer?: { x: number; y: number }) => ({ user: id ? { id, name } : null, ...(pointer ? { pointer } : {}) })

describe("here now on a board", () => {
  it("reads where a tab points, or nothing when it hasn't pointed", () => {
    const states = new Map<number, unknown>([[1, tab("sam", "Sam", { x: 40, y: -20 })], [2, tab("ann", "Ann")]])
    expect(pointerOf(states, 1)).toEqual({ x: 40, y: -20 })
    expect(pointerOf(states, 2)).toBeNull()
    expect(pointerOf(states, 9)).toBeNull()
  })

  it("scrolls a point to the middle of the canvas at the zoom it's at", () => {
    // At zoom 2 an 800 by 600 canvas shows 400 by 300 of the board: the point lands at (x + scrollX) * 2 = 400.
    const s = centreOn({ width: 800, height: 600, zoom: 2 }, { x: 1000, y: 50 })
    expect(s).toEqual({ scrollX: -800, scrollY: 100 })
    expect((1000 + s.scrollX) * 2).toBe(400)
    expect((50 + s.scrollY) * 2).toBe(300)
  })

  // Bring everyone here (miro-21 1): one jump per bring, for the people on the board when it was made.
  const view = { scrollX: -400, scrollY: 120, zoom: 0.5, width: 1280, height: 760 }
  // An editor's bring: the relay stamps each person's user with edit, from the board's member list.
  const bringing = (id: string, name: string, bring: unknown) => ({ user: { id, name, edit: true }, [BRING_FIELD]: bring })

  it("hands over another tab's new bring once, with who made it, and never this tab's own", () => {
    const states = new Map<number, unknown>([[1, bringing("ann", "Ann", { id: "b1", view })], [2, bringing("sam", "Sam", { id: "b2", view })]])
    const seen = new Set<string>()
    expect(bringsIn(states, 2, seen)).toEqual([{ client: 1, id: "b1", name: "Ann", view }])
    expect(bringsIn(states, 2, seen)).toEqual([])
    states.set(1, bringing("ann", "Ann", { id: "b3", view: { ...view, scrollX: 0 } }))
    expect(bringsIn(states, 2, seen)).toEqual([{ client: 1, id: "b3", name: "Ann", view: { ...view, scrollX: 0 } }])
  })

  it("never moves anyone to a bring made before they came: those are seen as the board opens", () => {
    const states = new Map<number, unknown>([[1, bringing("ann", "Ann", { id: "b1", view })]])
    const seen = new Set<string>()
    bringsIn(states, 2, seen)
    expect(bringsIn(states, 2, seen)).toEqual([])
  })

  it("leaves out a bring it can't show: no id, a view that isn't one, or a zoom of none", () => {
    for (const bad of [{ view }, { id: "x" }, { id: "x", view: { ...view, zoom: 0 } }, { id: "x", view: { ...view, scrollX: Number.NaN } }, { id: "x", view: { ...view, width: -1 } }, null, "b1"]) {
      expect(bringsIn(new Map<number, unknown>([[1, bringing("ann", "Ann", bad)]]), 2, new Set())).toEqual([])
    }
  })

  // Only an editor brings everyone (main's ruling, 1 Nov): the relay stamps each person's user with edit from the
  // board's member list (the collaboration service's presenceGuard.js), never as their tab claims.
  it("moves nobody for a bring from someone the relay doesn't stamp an editor, and keeps it unseen", () => {
    const seen = new Set<string>()
    for (const user of [{ id: "vic", name: "Vic", edit: false }, { id: "vic", name: "Vic" }, { id: "vic", name: "Vic", edit: "true" }, null]) {
      expect(bringsIn(new Map<number, unknown>([[1, { user, [BRING_FIELD]: { id: "forged", view } }]]), 2, seen), JSON.stringify(user)).toEqual([])
    }
    expect(seen.has("forged"), "a refused bring isn't marked seen").toBe(false)
  })
})
