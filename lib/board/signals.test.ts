import { describe, expect, it } from "vitest"
import { HAND_FIELD, LOWER_FIELD, REACT_FIELD, REACTIONS_KEPT, freshSignals, handsRaised, lowersFor, nextLowers, nextReactions, reactionsIn } from "./signals"

const editor = (name: string, extra: Record<string, unknown> = {}) => ({ user: { name, edit: true }, ...extra })
const viewer = (name: string, extra: Record<string, unknown> = {}) => ({ user: { name, edit: false }, ...extra })
const tabs = (...s: [number, unknown][]) => new Map<number, unknown>(s)

describe("a board's signals on its awareness (miro-24)", () => {
  it("freshSignals gives each other tab's signal once, by id, from one signal or a list, and never this tab's own", () => {
    const seen = new Set<string>()
    const read = (raw: Record<string, unknown>) => (typeof raw.n === "number" ? raw.n : null)
    const states = tabs([1, { f: { id: "a", n: 1 } }], [2, { f: [{ id: "b", n: 2 }, { id: "c", n: 3 }] }], [9, { f: { id: "mine", n: 9 } }])
    expect(freshSignals(states, 9, seen, "f", read).map((s) => [s.client, s.id, s.value])).toEqual([[1, "a", 1], [2, "b", 2], [2, "c", 3]])
    expect(freshSignals(states, 9, seen, "f", read)).toEqual([])
  })

  it("freshSignals leaves out, unseen, a signal it can't read or one with no id, so nothing is shown that isn't one", () => {
    const seen = new Set<string>()
    const read = (raw: Record<string, unknown>) => (raw.ok === true ? true : null)
    const states = tabs([1, { f: { id: "x", ok: false } }], [2, { f: { ok: true } }], [3, { f: { id: "", ok: true } }], [4, { f: "x" }], [5, null])
    expect(freshSignals(states, 9, seen, "f", read)).toEqual([])
    expect(seen.size).toBe(0)
  })

  it("reactions travel as a tab's last few, so a burst the network folds together loses none, and each shows once", () => {
    let mine: unknown = undefined
    for (let i = 1; i <= 5; i++) mine = nextReactions(mine, "👏", `r${i}`)
    expect(mine).toEqual([{ id: "r3", emoji: "👏" }, { id: "r4", emoji: "👏" }, { id: "r5", emoji: "👏" }])
    expect((mine as unknown[]).length).toBe(REACTIONS_KEPT)
    const seen = new Set<string>(["r3"])
    const got = reactionsIn(tabs([4, viewer("Vic", { [REACT_FIELD]: mine })]), 9, seen)
    expect(got.map((r) => [r.client, r.id, r.value, r.name])).toEqual([[4, "r4", "👏", "Vic"], [4, "r5", "👏", "Vic"]])
  })

  it("a reaction outside the set never shows, whoever sent it", () => {
    const states = tabs([4, editor("Ann", { [REACT_FIELD]: [{ id: "a", emoji: "<img src=x>" }, { id: "b", emoji: "🙂" }, { id: "c", emoji: "🎉" }] })])
    expect(reactionsIn(states, 9, new Set()).map((r) => r.value)).toEqual(["🎉"])
  })

  it("an editor's lowers travel as its last few, so two close together both arrive, and each is honoured once", () => {
    let mine: unknown = undefined
    for (const [client, id] of [[4, "l1"], [5, "l2"], [6, "l3"], [9, "l4"]] as const) mine = nextLowers(mine, client, id)
    expect(mine).toEqual([{ id: "l2", client: 5 }, { id: "l3", client: 6 }, { id: "l4", client: 9 }])
    expect(nextLowers([{ id: "x", client: "9" }, "junk"], 7, "l5")).toEqual([{ id: "l5", client: 7 }])
    const seen = new Set<string>()
    expect(lowersFor(tabs([3, editor("Ann", { [LOWER_FIELD]: mine })]), 9, seen).map((l) => l.id)).toEqual(["l4"])
    expect(lowersFor(tabs([3, editor("Ann", { [LOWER_FIELD]: mine })]), 9, seen)).toEqual([])
  })

  it("a raised hand is news once: an editor hears of each new one, not of one already up as the board opened", () => {
    const seen = new Set<string>()
    const before = tabs([1, viewer("Vic", { [HAND_FIELD]: { id: "old", raisedAt: 1 } })])
    handsRaised(before, 9, seen)
    const after = tabs([1, viewer("Vic", { [HAND_FIELD]: { id: "old", raisedAt: 1 } })], [2, viewer("Kim", { [HAND_FIELD]: { id: "new", raisedAt: 2 } })])
    expect(handsRaised(after, 9, seen).map((h) => h.name)).toEqual(["Kim"])
  })

  it("a tab lowers its own hand only at an editor's word: a viewer's lower, or one meant for another tab, moves nothing", () => {
    const seen = new Set<string>()
    const states = tabs(
      [2, viewer("Vic", { [LOWER_FIELD]: { id: "l1", client: 9 } })],
      [3, editor("Ann", { [LOWER_FIELD]: { id: "l2", client: 7 } })],
    )
    expect(lowersFor(states, 9, seen)).toEqual([])
    const ann = tabs([3, editor("Ann", { [LOWER_FIELD]: { id: "l3", client: 9 } })])
    expect(lowersFor(ann, 9, seen).map((l) => [l.client, l.id])).toEqual([[3, "l3"]])
    expect(lowersFor(ann, 9, seen)).toEqual([])
  })
})
