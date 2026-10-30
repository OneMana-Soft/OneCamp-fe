import { describe, expect, it } from "vitest"
import { followersOf, newSeen, presenceOf, type AwarenessState } from "./people"

// Who is in a doc, from its awareness states, by client: two people called
// Sam are two people (N50), a person's tabs are one person, idle is every tab
// idle, and an edit is news only when it is seen to happen.

const sam1 = { id: "u-sam-1", name: "Sam Rivera" }
const sam2 = { id: "u-sam-2", name: "Sam Rivera" }
const maya = { id: "u-maya", name: "Maya Chen" }

const states = (entries: Array<[number, AwarenessState]>) => new Map<number, AwarenessState>(entries)

describe("people in a doc", () => {
  it("keeps two people with one name apart, by their ids and their clients", () => {
    const p = presenceOf(states([[1, { user: sam1, mode: "editing" }], [2, { user: sam2, mode: "viewing" }], [3, { user: maya }]]), 3, newSeen(), null, 1000)
    expect(p.people["u-sam-1"]).toMatchObject({ clients: [1], mode: "editing", idle: false })
    expect(p.people["u-sam-2"]).toMatchObject({ clients: [2], mode: "viewing", idle: false })
    expect(p.self).toBe("u-maya")
  })

  it("is one person across their tabs: editing if any tab edits, idle only when every tab is", () => {
    const seen = newSeen()
    const one = presenceOf(states([[1, { user: maya, mode: "viewing", idle: true }], [2, { user: maya, mode: "editing", idle: false }]]), 9, seen, null, 1000)
    expect(one.people["u-maya"]).toMatchObject({ mode: "editing", idle: false })
    const both = presenceOf(states([[1, { user: maya, idle: true }], [2, { user: maya, idle: true }]]), 9, seen, null, 2000)
    expect(both.people["u-maya"].idle).toBe(true)
    // An older tab says nothing about idle: it counts as here.
    expect(presenceOf(states([[1, { user: maya }]]), 9, newSeen(), null, 1).people["u-maya"].idle).toBe(false)
  })

  it("puts the tab a person used last first, for Jump and Follow", () => {
    const seen = newSeen()
    presenceOf(states([[1, { user: maya, cursor: "a" }], [2, { user: maya, cursor: "b" }]]), 9, seen, null, 1000)
    const p = presenceOf(states([[1, { user: maya, cursor: "a" }], [2, { user: maya, cursor: "c" }]]), 9, seen, null, 2000)
    expect(p.people["u-maya"].clients).toEqual([2, 1])
  })

  it("says who edited last, once it sees the edit happen, never this tab's own", () => {
    const seen = newSeen()
    // An edit said before this tab looked is old news.
    let p = presenceOf(states([[1, { user: maya, edited: 5 }], [2, { user: sam1, edited: 7 }]]), 2, seen, null, 1000)
    expect(p.edit).toBeNull()
    p = presenceOf(states([[1, { user: maya, edited: 6 }], [2, { user: sam1, edited: 7 }]]), 2, seen, p.edit, 2000)
    expect(p.edit).toEqual({ userId: "u-maya", name: "Maya Chen", at: 2000 })
    // This tab's own edit isn't someone else's.
    p = presenceOf(states([[1, { user: maya, edited: 6 }], [2, { user: sam1, edited: 8 }]]), 2, seen, p.edit, 3000)
    expect(p.edit?.userId).toBe("u-maya")
  })

  it("says the first edit of someone this tab saw arrive", () => {
    const seen = newSeen()
    presenceOf(states([[1, { user: maya }]]), 2, seen, null, 1000)
    const p = presenceOf(states([[1, { user: maya, edited: 9 }]]), 2, seen, null, 2000)
    expect(p.edit).toEqual({ userId: "u-maya", name: "Maya Chen", at: 2000 })
  })

  it("forgets a client that left", () => {
    const seen = newSeen()
    presenceOf(states([[1, { user: maya, edited: 1 }]]), 9, seen, null, 1)
    presenceOf(states([]), 9, seen, null, 2)
    expect(seen.active.size + seen.edited.size + seen.moved.size).toBe(0)
  })

  it("knows who follows a client, so it says where it is looking only then", () => {
    const s = states([[1, { user: maya }], [2, { user: sam1, following: 1 }], [3, { user: sam2, following: 2 }]])
    expect(followersOf(s, 1)).toEqual([2])
    expect(followersOf(s, 3)).toEqual([])
  })
})

describe("people on a board", () => {
  // A board tab says its person and where it points (components/board/boardPresence), and its idle state as a doc's tab does.
  it("is one person across their board tabs, the tab that pointed last first, idle only when every tab says so", () => {
    const seen = newSeen()
    presenceOf(states([[1, { user: maya, pointer: { x: 0, y: 0 } }], [2, { user: maya, pointer: { x: 5, y: 5 } }], [3, { user: sam1, idle: true }]]), 3, seen, null, 1000)
    const p = presenceOf(states([[1, { user: maya, pointer: { x: 0, y: 0 } }], [2, { user: maya, pointer: { x: 9, y: 9 } }], [3, { user: sam1, idle: true }]]), 3, seen, null, 2000)
    expect(p.people["u-maya"]).toEqual({ clients: [2, 1], name: "Maya Chen", idle: false })
    expect(p.people["u-sam-1"].idle).toBe(true)
    expect(p.self).toBe("u-sam-1")
    expect(p.edit).toBeNull()
  })

  it("leaves out a board tab that hasn't named its person yet", () => {
    const p = presenceOf(states([[1, { pointer: { x: 1, y: 1 } }], [2, { user: maya }]]), 9, newSeen(), null, 1000)
    expect(Object.keys(p.people)).toEqual(["u-maya"])
  })
})
