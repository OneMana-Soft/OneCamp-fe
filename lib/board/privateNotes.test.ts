import { describe, expect, it } from "vitest"
import * as Y from "yjs"
import { storeWithMakers } from "./authors"
import { followShared, LOCAL_ORIGIN, mergeShared, UNLAYERED, type BoardElement } from "./binding"
import {
  emptyPrivateNotes,
  heldNoteCount,
  parsePrivateNotes,
  privateRoundOf,
  privateScene,
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
    doc.transact(() => storeWithMakers(authors, elements as never, scene, SAM, UNLAYERED, w), LOCAL_ORIGIN)
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

// V-528 (2): the veil carries the public face only. Words typed in private grow their text (and their card), and
// tags added in private sit in customData: neither may reach the shared board.
describe("the veil shows the public face only", () => {
  const at = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })

  it("a public note's words grown in private keep their public size and place", () => {
    const notes = emptyPrivateNotes("r1")
    const shared = sharedOf([card("c1", "t1", at(0, 0, 200, 200)), words("t1", "c1", "Old idea", { ...at(60, 88, 80, 24), fontSize: 20, lineHeight: 1.2 })])
    const scene = [
      card("c1", "t1", at(0, 0, 200, 340)),
      words("t1", "c1", "A much longer secret plan over many lines", { ...at(10, 18, 180, 304), fontSize: 20, lineHeight: 1.2, version: 2 }),
    ]
    const out = scene.map(writerFor(notes, shared, scene))
    expect(out[1]).toMatchObject({ text: "Old idea", ...at(60, 88, 80, 24) })
    // The card the words grew stays its public size.
    expect(out[0]).toMatchObject({ width: 200, height: 200 })
  })

  // CR-221 F1: the veil draws the face whole. Of the author's real copy it takes only what syncs it and the moves and
  // ties that are public by design; every other field changed in private keeps its face's value, in privateWriter's
  // copy (the server's) and privateScene's (thumbnail, AI, template) alike. `link` first: a URL is content.
  const PRIVATE_EDITS: Array<[string, unknown, unknown]> = [
    ["link", null, "https://secret.example/plan"],
    ["strokeColor", "#B98200", "#e03131"],
    ["backgroundColor", "#FFF6D6", "#000000"],
    ["fontSize", 20, 36],
    ["fontFamily", 5, 1],
    ["textAlign", "center", "left"],
    ["verticalAlign", "middle", "top"],
    ["angle", 0, 1.2],
    ["opacity", 100, 30],
    ["roundness", { type: 3 }, null],
    ["groupIds", [], ["g-secret"]],
    ["frameId", null, "f-secret"],
    ["strokeWidth", 1, 4],
    ["fillStyle", "solid", "hachure"],
  ]
  for (const [field, face, real] of PRIVATE_EDITS)
    it(`a ${field} changed in private stays in the author's tab`, () => {
      const notes = emptyPrivateNotes("r1")
      const pub = { [field]: face }
      const shared = sharedOf([card("c1", "t1", { ...at(0, 0, 200, 200), ...pub }), words("t1", "c1", "Old idea", { ...at(60, 88, 80, 24), ...pub })])
      const scene = [
        card("c1", "t1", { ...at(0, 0, 200, 200), ...pub, [field]: real, version: 2 }),
        words("t1", "c1", "Secret plan", { ...at(60, 88, 80, 24), ...pub, [field]: real, version: 2 }),
      ]
      const out = scene.map(writerFor(notes, shared, scene)) as El[]
      const seen = privateScene(scene, notes, SAM) as El[]
      for (const veiled of [out[0], out[1], seen[0], seen[1]]) expect(veiled[field]).toEqual(face)
      // What syncs it is the real copy's.
      expect(out.map((el) => el.version)).toEqual([2, 2])
    })

  // CR-221 row 2590 M1: the public side of the allowlist, pinned. A held note's ties and its place in the stack are
  // public by design, like a move, so the author's change to them goes out (a field dropped from PUBLIC_FIELDS fails here).
  const PUBLIC_EDITS: Array<[string, "card" | "words" | "both", unknown, unknown]> = [
    ["boundElements", "card", [{ id: "t1", type: "text" }], [{ id: "t1", type: "text" }, { id: "a1", type: "arrow" }]],
    ["boundElements", "words", null, [{ id: "a1", type: "arrow" }]],
    ["index", "both", "a0", "a5"],
    ["containerId", "words", "c1", "c2"],
  ]
  for (const [field, on, face, real] of PUBLIC_EDITS)
    it(`${field} changed in private on a held note's ${on === "both" ? "card and words" : on} goes out: it is public by design`, () => {
      const notes = emptyPrivateNotes("r1")
      const of = (part: "card" | "words", v: unknown) => (on === "both" || on === part ? { [field]: v } : {})
      const shared = sharedOf([card("c1", "t1", { ...at(0, 0, 200, 200), ...of("card", face) }), words("t1", "c1", "Old idea", { ...at(60, 88, 80, 24), ...of("words", face) })])
      const first = [card("c1", "t1", { ...at(0, 0, 200, 200), ...of("card", face) }), words("t1", "c1", "Secret plan", { ...at(60, 88, 80, 24), ...of("words", face), version: 2 })]
      first.map(writerFor(notes, shared, first))
      // Held now; the author then changes the field in private.
      const scene = [
        card("c1", "t1", { ...at(0, 0, 200, 200), ...of("card", real), version: 3 }),
        words("t1", "c1", "Secret plan", { ...at(60, 88, 80, 24), ...of("words", real), version: 3 }),
      ]
      const out = scene.map(writerFor(notes, shared, scene)) as El[]
      const seen = privateScene(scene, notes, SAM) as El[]
      expect(out.map((el) => el.locked)).toEqual([true, true])
      for (const i of on === "both" ? [0, 1] : on === "card" ? [0] : [1]) for (const veiled of [out[i], seen[i]]) expect(veiled[field]).toEqual(real)
    })

  // CR-221 row 2590 L1: the empty line of words made in private is sized from their first face, not the author's copy,
  // so a font made bigger in private never shows through the line's height or place.
  it("words made in private keep their first face's line when their font grows in private", () => {
    const notes = emptyPrivateNotes("r1")
    const scene = [card("c1", "t1", at(0, 0, 200, 200)), words("t1", "c1", "", { ...at(100, 88, 0, 24), fontSize: 20, lineHeight: 1.2 })]
    const write = writerFor(notes, new Map(), scene)
    scene.map(write)
    scene[1] = words("t1", "c1", "Secret", { ...at(10, 18, 180, 90), fontSize: 40, lineHeight: 1.5, version: 2 })
    const out = scene.map(write) as El[]
    const seen = privateScene(scene, notes, SAM) as El[]
    for (const veiled of [out[1], seen[1]]) expect(veiled).toMatchObject({ text: "", fontSize: 20, lineHeight: 1.2, x: 100, y: 88, width: 0, height: 24 })
  })

  it("a held note moved in private moves, its words with it", () => {
    const notes = emptyPrivateNotes("r1")
    const shared = sharedOf([card("c1", "t1", at(0, 0, 200, 200)), words("t1", "c1", "Old idea", at(60, 88, 80, 24))])
    const scene = [card("c1", "t1", { ...at(300, 100, 200, 200), version: 2 }), words("t1", "c1", "Secret plan", { ...at(310, 118, 180, 164), version: 2 })]
    const out = scene.map(writerFor(notes, shared, scene))
    expect(out[0]).toMatchObject(at(300, 100, 200, 200))
    expect(out[1]).toMatchObject({ text: "Old idea", ...at(360, 188, 80, 24) })
  })

  it("a note made in private shows one empty line at the centre of its first face", () => {
    const notes = emptyPrivateNotes("r1")
    const scene = [card("c1", "t1", at(0, 0, 200, 200)), words("t1", "c1", "", { ...at(100, 88, 0, 24), fontSize: 20, lineHeight: 1.2 })]
    const write = writerFor(notes, new Map(), scene)
    scene.map(write)
    // The author types and the card grows: the shared copies keep the first face.
    scene[0] = card("c1", "t1", { ...at(0, 0, 200, 320), version: 2 })
    scene[1] = words("t1", "c1", "Secret plan in three long lines", { ...at(10, 18, 180, 284), fontSize: 20, lineHeight: 1.2, version: 2 })
    const out = scene.map(write)
    expect(out[0]).toMatchObject({ width: 200, height: 200 })
    expect(out[1]).toMatchObject({ text: "", x: 100, y: 88, width: 0, height: 24 })
  })

  it("tags added in private stay in the author's tab", () => {
    const notes = emptyPrivateNotes("r1")
    const shared = sharedOf([card("c1", "t1", { customData: { kind: "note", colour: "yellow", tags: ["ux"] } }), words("t1", "c1", "Old idea")])
    const scene = [
      card("c1", "t1", { customData: { kind: "note", colour: "yellow", tags: ["ux", "layoffs"] }, version: 2 }),
      words("t1", "c1", "Secret plan", { customData: { tags: ["hr"] }, version: 2 }),
    ]
    const out = scene.map(writerFor(notes, shared, scene))
    expect((out[0] as El).customData).toEqual({ kind: "note", colour: "yellow", tags: ["ux"], privateBy: SAM.id, privateName: SAM.name })
    expect((out[1] as El).customData).toEqual({ privateBy: SAM.id, privateName: SAM.name })
  })

  it("a record kept before faces existed still reads, and keeps its faces when it has them", () => {
    const old = { round: "r1", publicText: { t1: "" }, real: {} }
    expect(parsePrivateNotes(JSON.stringify(old))).toEqual(old)
    const kept = { ...old, face: { t1: { blank: true } } }
    expect(parsePrivateNotes(JSON.stringify(kept))).toEqual(kept)
  })
})
