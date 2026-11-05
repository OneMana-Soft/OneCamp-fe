import { describe, expect, it } from "vitest"
import type { BoardElement } from "./binding"
import { emptyPrivateNotes, veiledBy } from "./privateNotes"
import { mergePrivateNotes, revealScene, withoutHeld } from "./privateRecord"

// The record a browser keeps of its member's held notes, and its reveal (miro-25; V-497, V-494).

type El = BoardElement & Record<string, unknown>
const SAM = { id: "u-sam", name: "Sam Rivera" }
const card = (id: string, textId: string, extra: Record<string, unknown> = {}): El => ({
  id,
  type: "rectangle",
  version: 1,
  versionNonce: 1,
  customData: { kind: "note", colour: "yellow" },
  boundElements: [{ id: textId, type: "text" }],
  ...extra,
})
const words = (id: string, containerId: string, text: string, extra: Record<string, unknown> = {}): El => ({
  id,
  type: "text",
  version: 1,
  versionNonce: 1,
  containerId,
  text,
  originalText: text,
  ...extra,
})

describe("the reveal", () => {
  it("bumps every held element so every screen takes it, and leaves the rest as they were", () => {
    const notes = emptyPrivateNotes("r1")
    notes.publicText = { c1: "", t1: "" }
    const other = words("t2", "c2", "Public")
    const scene = [card("c1", "t1"), words("t1", "c1", "Secret plan", { version: 3 }), other]
    const { elements, revealed } = revealScene(scene, notes, new Map(), SAM.id)
    expect(revealed).toBe(2)
    expect(elements[1]).toMatchObject({ text: "Secret plan", version: 4 })
    expect(elements[0].version).toBe(2)
    expect(elements[2]).toBe(other)
  })

  it("a tab reopened after its round ended reveals from what it kept, above the shared copy's version", () => {
    const notes = emptyPrivateNotes("r1")
    notes.publicText = { t1: "" }
    notes.real.t1 = words("t1", "c1", "Secret plan", { version: 2 })
    const scene = [words("t1", "c1", "", { version: 6, locked: true, customData: { privateBy: SAM.id, privateName: SAM.name } })]
    const { elements } = revealScene(scene, notes, new Map(), SAM.id)
    expect(elements[0]).toMatchObject({ text: "Secret plan", version: 7 })
  })

  it("reads the board's document, not the canvas: a held note the canvas hasn't yet comes from the copy the tab kept, above the document's", () => {
    const notes = emptyPrivateNotes("r1")
    notes.publicText = { c1: "", t1: "" }
    notes.real.c1 = card("c1", "t1")
    notes.real.t1 = words("t1", "c1", "Secret plan", { version: 2 })
    const veil = { locked: true, customData: { privateBy: SAM.id, privateName: SAM.name } }
    const doc = new Map<string, unknown>([["t1", words("t1", "c1", "", { version: 6, ...veil })]])
    const other = words("t2", "c2", "Public")
    const { elements, revealed } = revealScene([other], notes, doc, SAM.id)
    expect(revealed).toBe(2)
    expect(elements[0]).toBe(other)
    expect(elements.slice(1)).toMatchObject([{ id: "c1", version: 2 }, { id: "t1", text: "Secret plan", version: 7 }])
    expect(elements[2].locked).toBeUndefined()
  })

  it("shows nothing for a held note whose document copy is open (its author's other tab or device showed it) or deleted, and nothing the tab deleted before the document took it", () => {
    const notes = emptyPrivateNotes("r1")
    notes.publicText = { t1: "", t2: "", t3: "" }
    notes.real.t1 = words("t1", "c1", "Secret plan", { version: 2 })
    notes.real.t3 = words("t3", "c3", "Gone", { version: 2, isDeleted: true })
    const doc = new Map<string, unknown>([
      ["t1", words("t1", "c1", "Secret plan, final", { version: 5 })],
      ["t2", words("t2", "c2", "", { version: 4, isDeleted: true, locked: true, customData: { privateBy: SAM.id } })],
    ])
    expect(revealScene([], notes, doc, SAM.id)).toEqual({ elements: [], revealed: 0 })
  })

  it("takes the veil off a held element the tab kept no copy of, so it never stays locked", () => {
    const notes = emptyPrivateNotes("r1")
    notes.publicText = { c1: "" }
    const veiled = card("c1", "t1", { version: 3, locked: true, customData: { kind: "note", colour: "yellow", privateBy: SAM.id, privateName: SAM.name } })
    const { elements } = revealScene([veiled], notes, new Map([["c1", veiled]]), SAM.id)
    expect(elements[0]).toMatchObject({ locked: false, version: 4, customData: { kind: "note", colour: "yellow" } })
    expect(veiledBy(elements[0])).toBeNull()
  })
})

describe("one browser's record, kept by a member's tabs (V-494)", () => {
  it("merges two tabs' records: every id either holds, this tab's public words first, each real copy the later version, in this tab's round", () => {
    const mine = emptyPrivateNotes("r2")
    mine.publicText = { t1: "Mine", t2: "" }
    mine.real.t1 = words("t1", "c1", "Mine, edited", { version: 4 })
    mine.real.t2 = words("t2", "c2", "Older", { version: 1 })
    const stored = emptyPrivateNotes("r1")
    stored.publicText = { t1: "Theirs", t2: "", t3: "" }
    stored.real.t1 = words("t1", "c1", "Theirs, edited", { version: 3 })
    stored.real.t2 = words("t2", "c2", "Newer", { version: 2 })
    stored.real.t3 = words("t3", "c3", "Only theirs")
    const merged = mergePrivateNotes(mine, stored)
    expect(merged.round).toBe("r2")
    expect(merged.publicText).toEqual({ t1: "Mine", t2: "", t3: "" })
    expect(["t1", "t2", "t3"].map((id) => (merged.real[id] as El).text)).toEqual(["Mine, edited", "Newer", "Only theirs"])
    expect(mergePrivateNotes(mine, null)).toBe(mine)
  })

  it("drops only the ids a reveal settled, and is nothing once none is left", () => {
    const notes = emptyPrivateNotes("r1")
    notes.publicText = { t1: "", t2: "" }
    notes.real.t1 = words("t1", "c1", "One")
    notes.real.t2 = words("t2", "c2", "Two")
    expect(withoutHeld(notes, ["t1"])).toEqual({ round: "r1", publicText: { t2: "" }, real: { t2: notes.real.t2 } })
    expect(withoutHeld(notes, ["t1", "t2"])).toBeNull()
    expect(notes.publicText).toEqual({ t1: "", t2: "" })
  })
})
