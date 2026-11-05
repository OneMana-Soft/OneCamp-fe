import { describe, expect, it } from "vitest"
import * as Y from "yjs"
import { storeWithMakers } from "./authors"
import { followShared, LOCAL_ORIGIN, mergeShared, type BoardElement } from "./binding"
import {
  emptyPrivateNotes,
  heldNoteCount,
  parsePrivateNotes,
  privateRoundOf,
  privateWriter,
  restoreScene,
  unveil,
  veiledBy,
  type PrivateNotes,
} from "./privateNotes"

// Private mode (miro-25): a note made or edited while a round runs never leaves its author's tab until the
// reveal. The shared board, and so the server, AI and every other screen, holds the note's last public text.

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
const sharedOf = (els: El[]) => new Map(els.map((el) => [el.id, el]))
const writerFor = (notes: PrivateNotes, shared: Map<string, El>, scene: El[]) =>
  privateWriter(notes, SAM, { get: (id) => shared.get(id) }, (id) => scene.find((el) => el.id === id))

describe("a private round", () => {
  it("is read from the facilitation map, and anything else there is no round", () => {
    expect(privateRoundOf({ id: "r1", byId: "u-sam", byName: "Sam Rivera", startedAt: 5 })).toEqual({ id: "r1", byId: "u-sam", byName: "Sam Rivera", startedAt: 5 })
    expect(privateRoundOf(undefined)).toBeNull()
    expect(privateRoundOf({ id: "", byId: "u", byName: "x", startedAt: 1 })).toBeNull()
    expect(privateRoundOf({ id: "r1", byId: 3, byName: "x", startedAt: 1 })).toBeNull()
    expect(privateRoundOf("r1")).toBeNull()
  })
})

describe("what a private note sends to the shared board", () => {
  it("a note made in private goes with no words, locked, and named as its author's", () => {
    const notes = emptyPrivateNotes("r1")
    const scene = [card("c1", "t1"), words("t1", "c1", "Secret plan")]
    const out = scene.map(writerFor(notes, new Map(), scene))
    expect(out[1]).toMatchObject({ text: "", originalText: "", locked: true, version: 1, versionNonce: 1 })
    expect(out[0]).toMatchObject({ locked: true, version: 1 })
    expect(veiledBy(out[0])).toEqual(SAM)
    expect(veiledBy(out[1])).toEqual(SAM)
    // The author's own scene keeps the words, unlocked.
    expect(scene[1]).toMatchObject({ text: "Secret plan", originalText: "Secret plan" })
    expect(scene[1].locked).toBeUndefined()
    expect(Object.keys(notes.publicText).sort()).toEqual(["c1", "t1"])
  })

  it("a public note edited in private keeps its last public words on the shared board", () => {
    const notes = emptyPrivateNotes("r1")
    const shared = sharedOf([card("c1", "t1"), words("t1", "c1", "Old idea")])
    const scene = [card("c1", "t1"), words("t1", "c1", "Secret plan", { version: 2, versionNonce: 7 })]
    const out = writerFor(notes, shared, scene)(scene[1])
    expect(out).toMatchObject({ text: "Old idea", originalText: "Old idea", version: 2, versionNonce: 7, locked: true })
    expect(notes.publicText.t1).toBe("Old idea")
    // Its card is held too, so no one else can open it while it's private.
    expect(notes.publicText).toHaveProperty("c1")
  })

  it("a public note only moved stays public", () => {
    const notes = emptyPrivateNotes("r1")
    const shared = sharedOf([card("c1", "t1"), words("t1", "c1", "Old idea")])
    const scene = [card("c1", "t1", { x: 40, version: 2 }), words("t1", "c1", "Old idea", { x: 50, version: 2 })]
    const w = writerFor(notes, shared, scene)
    expect(scene.map(w)).toEqual(scene)
    expect(notes.publicText).toEqual({})
  })

  it("words on a shape or free text are never held: private mode is for notes", () => {
    const notes = emptyPrivateNotes("r1")
    const scene = [{ id: "s1", type: "rectangle", version: 1, boundElements: [{ id: "t9", type: "text" }] } as El, words("t9", "s1", "A label"), words("t8", "", "Free text", { containerId: null })]
    expect(scene.map(writerFor(notes, new Map(), scene))).toEqual(scene)
    expect(notes.publicText).toEqual({})
  })

  it("a note held once stays held for the round, even after its words go back", () => {
    const notes = emptyPrivateNotes("r1")
    const shared = sharedOf([card("c1", "t1"), words("t1", "c1", "Old idea")])
    const scene = [card("c1", "t1"), words("t1", "c1", "Secret", { version: 2 })]
    writerFor(notes, shared, scene)(scene[1])
    shared.set("t1", { ...scene[1], text: "Old idea", originalText: "Old idea" })
    const back = words("t1", "c1", "Old idea", { version: 3 })
    expect(writerFor(notes, shared, [scene[0], back])(back)).toMatchObject({ text: "Old idea", locked: true })
    expect(veiledBy(writerFor(notes, shared, [scene[0], back])(back))).toEqual(SAM)
  })

  it("the board's document never has the words: the frame's sync writes the veiled copies", () => {
    const doc = new Y.Doc()
    const elements = doc.getMap<El>("elements")
    const authors = doc.getMap<unknown>("noteAuthors")
    const notes = emptyPrivateNotes("r1")
    const scene = [card("c1", "t1"), words("t1", "c1", "Secret plan")]
    const w = privateWriter(notes, SAM, { get: (id) => elements.get(id) }, (id) => scene.find((el) => el.id === id))
    doc.transact(() => storeWithMakers(authors, elements as never, scene, SAM, w), LOCAL_ORIGIN)
    expect(elements.size).toBe(2)
    expect(JSON.stringify(elements.toJSON())).not.toContain("Secret plan")
    expect(Buffer.from(Y.encodeStateAsUpdate(doc)).toString("latin1")).not.toContain("Secret plan")
    // The author is still named, as Miro shows authors in private mode.
    expect(authors.get("c1")).toEqual(SAM)
  })

  it("a private note deleted goes as deleted, still without its words", () => {
    const notes = emptyPrivateNotes("r1")
    const scene = [card("c1", "t1"), words("t1", "c1", "Secret plan")]
    const w = writerFor(notes, new Map(), scene)
    scene.forEach(w)
    const gone = words("t1", "c1", "Secret plan", { isDeleted: true, version: 2 })
    expect(w(gone)).toMatchObject({ isDeleted: true, text: "" })
  })
})

describe("what the author's own tab takes back", () => {
  it("a shared copy of a private note keeps the author's words, at the shared copy's version", () => {
    const notes = emptyPrivateNotes("r1")
    notes.publicText.t1 = "Old idea"
    const mine = words("t1", "c1", "Secret plan", { version: 2, versionNonce: 3 })
    const remote = { ...words("t1", "c1", "Old idea", { version: 4, versionNonce: 9, locked: true }), customData: { privateBy: SAM.id, privateName: SAM.name } }
    const got = unveil(notes, remote, mine)
    expect(got).toMatchObject({ text: "Secret plan", originalText: "Secret plan", version: 4, versionNonce: 9 })
    expect((got as El).locked).toBeUndefined()
    expect(veiledBy(got)).toBeNull()
    // Anyone else's note, or one this tab has nothing of, comes as it is.
    const other = words("t2", "c2", "Public")
    expect(unveil(notes, other, undefined)).toBe(other)
    expect(unveil(notes, remote, undefined)).toBe(remote)
  })

  it("the board following its document keeps the author's words when a veiled copy comes back", () => {
    const doc = new Y.Doc()
    const elements = doc.getMap<El>("elements")
    const notes = emptyPrivateNotes("r1")
    notes.publicText.t1 = ""
    let scene: El[] = [words("t1", "c1", "Secret plan", { version: 2, versionNonce: 3 })]
    const api = { getSceneElementsIncludingDeleted: () => scene, updateScene: (s: { elements: El[] }) => void (scene = s.elements) }
    const follow = followShared(api as never, elements as never, {
      frame: () => 0,
      cancel: () => {},
      inbound: (remote) => unveil(notes, remote as El, scene.find((el) => el.id === remote.id)),
    })
    elements.set("t1", { ...words("t1", "c1", "", { version: 5, versionNonce: 8, locked: true }), customData: { privateBy: SAM.id } })
    expect(scene[0]).toMatchObject({ text: "Secret plan", version: 5, versionNonce: 8 })
    follow.stop()
  })

  it("the first merge of a reopened board takes the author's words from what the tab kept", () => {
    const notes = emptyPrivateNotes("r1")
    notes.publicText.t1 = ""
    notes.real.t1 = words("t1", "c1", "Secret plan", { version: 2 })
    const veiled = words("t1", "c1", "", { version: 2, locked: true })
    const { elements } = mergeShared([], [veiled].map((el) => unveil(notes, el, notes.real[el.id] as El)))
    expect(elements[0]).toMatchObject({ text: "Secret plan" })
  })

  it("a canvas that took the veiled copies before private mode's code came gets the author's words back, at their versions", () => {
    const notes = emptyPrivateNotes("r1")
    notes.publicText = { c1: "", t1: "" }
    notes.real.t1 = words("t1", "c1", "Secret plan", { version: 2 })
    const veiled = words("t1", "c1", "", { version: 4, versionNonce: 9, locked: true, customData: { privateBy: SAM.id, privateName: SAM.name } })
    const other = words("t2", "c2", "Public")
    const plain = card("c1", "t1")
    const { elements, restored } = restoreScene([plain, veiled, other], notes)
    expect(restored).toBe(1)
    expect(elements[1]).toMatchObject({ text: "Secret plan", originalText: "Secret plan", version: 4, versionNonce: 9 })
    expect(elements[1].locked).toBeUndefined()
    expect(elements[0]).toBe(plain)
    expect(elements[2]).toBe(other)
    expect(restoreScene([other], notes)).toEqual({ elements: [other], restored: 0 })
  })
})

describe("what the tab keeps across a reload", () => {
  it("round-trips, and anything else reads as nothing kept", () => {
    const notes = emptyPrivateNotes("r1")
    notes.publicText.t1 = "Old"
    notes.real.t1 = words("t1", "c1", "Secret")
    expect(parsePrivateNotes(JSON.stringify(notes))).toEqual(notes)
    expect(parsePrivateNotes(null)).toBeNull()
    expect(parsePrivateNotes("{")).toBeNull()
    expect(parsePrivateNotes(JSON.stringify({ round: 3 }))).toBeNull()
    expect(parsePrivateNotes(JSON.stringify({ round: "r1", publicText: { t1: 4 }, real: {} }))).toBeNull()
  })
})

describe("how many notes a board holds back", () => {
  it("counts each held note once, its words not as a second note, and a deleted one not at all", () => {
    const notes = emptyPrivateNotes("r1")
    const open = [card("c2", "t2"), words("t2", "c2", "Open")]
    const scene = [card("c1", "t1"), words("t1", "c1", "Secret"), ...open]
    const out = scene.map(writerFor(notes, sharedOf(open), scene))
    expect(out.filter((el) => veiledBy(el)).map((el) => el.id)).toEqual(["c1", "t1"])
    expect(heldNoteCount(out)).toBe(1)
    expect(heldNoteCount([{ ...out[0], isDeleted: true }, out[1], ...open])).toBe(0)
    expect(heldNoteCount(open)).toBe(0)
    expect(heldNoteCount([])).toBe(0)
  })
})
